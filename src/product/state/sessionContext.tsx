import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import {
  computeCoverCrop,
  computeZoomedCrop,
  normalizeRect,
  panCrop,
} from "../../technical/imaging/crop";
import { FaceDetectorClient } from "../../technical/imaging/faceClient";
import { IMAGING_CONSTANTS, type CropRect } from "../../technical/imaging/types";
import { loadNanumGothicFont } from "../../technical/pdf/fontLoader";
import { computeNameLayout } from "../../technical/pdf/nameLayout";
import type { FontkitFont } from "../../technical/pdf/types";
import { calculateMatches, normalizeMatchKey } from "../services/matching";
import { revokeAllPhotos, revokePhotoRecord } from "../services/photoStorage";
import { generateSyntheticEmployees } from "../services/syntheticData";
import type {
  BlockingIssue,
  ContractType,
  Employee,
  EmployeeEdit,
  JobCategory,
  PhotoItem,
  PhotoLink,
  ProductSessionState,
  SummaryCounts,
} from "../types";

type Action =
  | { type: "SET_STEP"; step: 1 | 2 | 3 | 4 }
  | { type: "ADD_EMPLOYEE"; employee: Employee }
  | { type: "UPDATE_EMPLOYEE"; employee: Employee }
  | { type: "DELETE_EMPLOYEE"; employeeId: string }
  | { type: "IMPORT_EMPLOYEES"; employees: readonly Employee[] }
  | { type: "ADD_PHOTOS"; photos: readonly PhotoItem[] }
  | { type: "REMOVE_PHOTO"; photoId: string }
  | { type: "TOGGLE_IGNORE_PHOTO"; photoId: string }
  | { type: "IGNORE_ALL_LEFTOVER_PHOTOS" }
  | { type: "LINK_PHOTO"; employeeId: string; photoId: string; mode: "auto" | "manual" }
  | { type: "UNLINK_PHOTO"; employeeId: string }
  | { type: "REPLACE_LINK"; employeeId: string; photoId: string }
  | { type: "SELECT_EMPLOYEE"; employeeId: string | null }
  | { type: "SET_EDITOR_FILTER"; filter: "all" | "needsReview" }
  | {
      type: "UPDATE_EDIT_CROP";
      employeeId: string;
      crop: CropRect;
      zoom?: number;
      width: number;
      height: number;
    }
  | {
      type: "RESET_EDIT_TO_AUTO";
      employeeId: string;
      width: number;
      height: number;
    }
  | {
      type: "RESET_EDIT_TO_COVER";
      employeeId: string;
      width: number;
      height: number;
    }
  | { type: "CONFIRM_ISSUES"; employeeId: string }
  | { type: "CONFIRM_LOW_RES"; employeeId: string }
  | { type: "SET_DETECTION_RESULT"; employeeId: string; edit: EmployeeEdit }
  | {
      type: "FONT_LOADED";
      font: FontkitFont;
      fontBytes: Uint8Array;
    }
  | { type: "FONT_ERROR"; error: string }
  | { type: "SET_GENERATING_PDF"; isGenerating: boolean; error?: string }
  | { type: "TOGGLE_CALIBRATION_MARKS"; enabled: boolean }
  | { type: "RESET_SESSION" };

const initialState: ProductSessionState = {
  step: 1,
  employees: [],
  photos: [],
  links: [],
  edits: {},
  selectedEmployeeId: null,
  editorFilter: "all",
  font: null,
  fontBytes: null,
  fontLoading: true,
  fontError: null,
  isGeneratingPdf: false,
  pdfGenerationError: null,
  includeCalibrationMarks: false,
};

function sessionReducer(
  state: ProductSessionState,
  action: Action,
): ProductSessionState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };

    case "ADD_EMPLOYEE": {
      const updatedEmployees = [...state.employees, action.employee];
      const matchResult = calculateMatches(updatedEmployees, state.photos, state.links);
      return {
        ...state,
        employees: updatedEmployees,
        links: matchResult.links,
      };
    }

    case "UPDATE_EMPLOYEE": {
      const updatedEmployees = state.employees.map((e) =>
        e.id === action.employee.id ? action.employee : e,
      );
      const matchResult = calculateMatches(updatedEmployees, state.photos, state.links);
      return {
        ...state,
        employees: updatedEmployees,
        links: matchResult.links,
      };
    }

    case "DELETE_EMPLOYEE": {
      const updatedEmployees = state.employees
        .filter((e) => e.id !== action.employeeId)
        .map((e, idx) => ({ ...e, order: idx + 1 }));

      const updatedLinks = state.links.filter((l) => l.employeeId !== action.employeeId);
      const updatedEdits = { ...state.edits };
      delete updatedEdits[action.employeeId];

      const matchResult = calculateMatches(updatedEmployees, state.photos, updatedLinks);

      return {
        ...state,
        employees: updatedEmployees,
        links: matchResult.links,
        edits: updatedEdits,
        selectedEmployeeId:
          state.selectedEmployeeId === action.employeeId ? null : state.selectedEmployeeId,
      };
    }

    case "IMPORT_EMPLOYEES": {
      const startOrder = state.employees.length + 1;
      const renumbered = action.employees.map((e, idx) => ({
        ...e,
        order: startOrder + idx,
      }));
      const updatedEmployees = [...state.employees, ...renumbered];
      const matchResult = calculateMatches(updatedEmployees, state.photos, state.links);

      return {
        ...state,
        employees: updatedEmployees,
        links: matchResult.links,
      };
    }

    case "ADD_PHOTOS": {
      const updatedPhotos = [...state.photos, ...action.photos];
      const matchResult = calculateMatches(state.employees, updatedPhotos, state.links);

      return {
        ...state,
        photos: updatedPhotos,
        links: matchResult.links,
      };
    }

    case "REMOVE_PHOTO": {
      const photoToRemove = state.photos.find((p) => p.id === action.photoId);
      if (photoToRemove) {
        revokePhotoRecord(photoToRemove);
      }
      const updatedPhotos = state.photos.filter((p) => p.id !== action.photoId);
      const updatedLinks = state.links.filter((l) => l.photoId !== action.photoId);

      // Clean up edits for affected employees
      const updatedEdits = { ...state.edits };
      for (const link of state.links) {
        if (link.photoId === action.photoId) {
          delete updatedEdits[link.employeeId];
        }
      }

      const matchResult = calculateMatches(state.employees, updatedPhotos, updatedLinks);

      return {
        ...state,
        photos: updatedPhotos,
        links: matchResult.links,
        edits: updatedEdits,
      };
    }

    case "TOGGLE_IGNORE_PHOTO": {
      const updatedPhotos = state.photos.map((p) =>
        p.id === action.photoId ? { ...p, ignored: !p.ignored } : p,
      );
      // If ignored, unlink any employee
      const updatedLinks = state.links.filter((l) => {
        const photo = updatedPhotos.find((p) => p.id === l.photoId);
        return photo && !photo.ignored;
      });

      const matchResult = calculateMatches(state.employees, updatedPhotos, updatedLinks);

      return {
        ...state,
        photos: updatedPhotos,
        links: matchResult.links,
      };
    }

    case "IGNORE_ALL_LEFTOVER_PHOTOS": {
      const linkedPhotoIds = new Set(state.links.map((l) => l.photoId));
      const updatedPhotos = state.photos.map((p) =>
        linkedPhotoIds.has(p.id) ? p : { ...p, ignored: true },
      );
      return {
        ...state,
        photos: updatedPhotos,
      };
    }

    case "LINK_PHOTO": {
      // Remove any existing link for this employee and this photo (1:1 guarantee)
      const filteredLinks = state.links.filter(
        (l) => l.employeeId !== action.employeeId && l.photoId !== action.photoId,
      );
      const newLink: PhotoLink = {
        employeeId: action.employeeId,
        photoId: action.photoId,
        mode: action.mode,
        revision: 1,
      };

      // Invalidate existing edit for this employee
      const updatedEdits = { ...state.edits };
      delete updatedEdits[action.employeeId];

      return {
        ...state,
        links: [...filteredLinks, newLink],
        edits: updatedEdits,
      };
    }

    case "UNLINK_PHOTO": {
      const updatedLinks = state.links.filter((l) => l.employeeId !== action.employeeId);
      const updatedEdits = { ...state.edits };
      delete updatedEdits[action.employeeId];

      return {
        ...state,
        links: updatedLinks,
        edits: updatedEdits,
      };
    }

    case "REPLACE_LINK": {
      const filteredLinks = state.links.filter(
        (l) => l.employeeId !== action.employeeId && l.photoId !== action.photoId,
      );
      const newLink: PhotoLink = {
        employeeId: action.employeeId,
        photoId: action.photoId,
        mode: "manual",
        revision: 1,
      };
      const updatedEdits = { ...state.edits };
      delete updatedEdits[action.employeeId];

      return {
        ...state,
        links: [...filteredLinks, newLink],
        edits: updatedEdits,
      };
    }

    case "SELECT_EMPLOYEE":
      return { ...state, selectedEmployeeId: action.employeeId };

    case "SET_EDITOR_FILTER":
      return { ...state, editorFilter: action.filter };

    case "UPDATE_EDIT_CROP": {
      const existing = state.edits[action.employeeId];
      if (!existing) return state;

      const norm = normalizeRect(action.crop, action.width, action.height);
      const cover = computeCoverCrop(action.width, action.height);
      const zoom = action.zoom ?? cover.height / action.crop.height;

      const updatedEdit: EmployeeEdit = {
        ...existing,
        crop: action.crop,
        normalizedCrop: norm,
        zoom,
        revision: existing.revision + 1,
        manuallyEdited: true,
      };

      return {
        ...state,
        edits: {
          ...state.edits,
          [action.employeeId]: updatedEdit,
        },
      };
    }

    case "RESET_EDIT_TO_AUTO": {
      const existing = state.edits[action.employeeId];
      if (!existing) return state;

      const targetCrop = existing.autoCrop ?? computeCoverCrop(action.width, action.height);
      const norm = normalizeRect(targetCrop, action.width, action.height);
      const cover = computeCoverCrop(action.width, action.height);

      const updatedEdit: EmployeeEdit = {
        ...existing,
        crop: targetCrop,
        normalizedCrop: norm,
        zoom: cover.height / targetCrop.height,
        revision: existing.revision + 1,
        manuallyEdited: false,
        confirmedIssues: existing.issues.length === 0,
        confirmedLowRes: false,
      };

      return {
        ...state,
        edits: {
          ...state.edits,
          [action.employeeId]: updatedEdit,
        },
      };
    }

    case "RESET_EDIT_TO_COVER": {
      const existing = state.edits[action.employeeId];
      if (!existing) return state;

      const cover = computeCoverCrop(action.width, action.height);
      const norm = normalizeRect(cover, action.width, action.height);

      const updatedEdit: EmployeeEdit = {
        ...existing,
        crop: cover,
        normalizedCrop: norm,
        zoom: 1.0,
        revision: existing.revision + 1,
        manuallyEdited: true,
        confirmedIssues: false,
        confirmedLowRes: false,
      };

      return {
        ...state,
        edits: {
          ...state.edits,
          [action.employeeId]: updatedEdit,
        },
      };
    }

    case "CONFIRM_ISSUES": {
      const existing = state.edits[action.employeeId];
      if (!existing) return state;

      return {
        ...state,
        edits: {
          ...state.edits,
          [action.employeeId]: {
            ...existing,
            confirmedIssues: true,
          },
        },
      };
    }

    case "CONFIRM_LOW_RES": {
      const existing = state.edits[action.employeeId];
      if (!existing) return state;

      return {
        ...state,
        edits: {
          ...state.edits,
          [action.employeeId]: {
            ...existing,
            confirmedLowRes: true,
          },
        },
      };
    }

    case "SET_DETECTION_RESULT": {
      const existing = state.edits[action.employeeId];
      // If user already manually edited before this worker response arrived, do not overwrite crop!
      if (existing && existing.manuallyEdited) {
        return {
          ...state,
          edits: {
            ...state.edits,
            [action.employeeId]: {
              ...existing,
              detectionStatus: action.edit.detectionStatus,
              faceCount: action.edit.faceCount,
              faces: action.edit.faces,
              autoCrop: action.edit.autoCrop,
            },
          },
        };
      }

      return {
        ...state,
        edits: {
          ...state.edits,
          [action.employeeId]: action.edit,
        },
      };
    }

    case "FONT_LOADED":
      return {
        ...state,
        font: action.font,
        fontBytes: action.fontBytes,
        fontLoading: false,
        fontError: null,
      };

    case "FONT_ERROR":
      return {
        ...state,
        fontLoading: false,
        fontError: action.error,
      };

    case "SET_GENERATING_PDF":
      return {
        ...state,
        isGeneratingPdf: action.isGenerating,
        pdfGenerationError: action.error ?? null,
      };

    case "TOGGLE_CALIBRATION_MARKS":
      return {
        ...state,
        includeCalibrationMarks: action.enabled,
      };

    case "RESET_SESSION": {
      revokeAllPhotos(state.photos);
      return {
        ...initialState,
        font: state.font,
        fontBytes: state.fontBytes,
        fontLoading: state.fontLoading,
        fontError: state.fontError,
      };
    }

    default:
      return state;
  }
}

export interface SessionContextValue {
  readonly state: ProductSessionState;
  readonly summaryCounts: SummaryCounts;
  readonly blockingIssues: readonly BlockingIssue[];
  readonly canProceedToStep2: boolean;
  readonly canProceedToStep3: boolean;
  readonly canProceedToStep4: boolean;
  readonly canGeneratePdf: boolean;
  readonly faceDetector: FaceDetectorClient;

  setStep: (step: 1 | 2 | 3 | 4) => void;
  addEmployee: (name: string, jobCategory: JobCategory, contractType: ContractType) => void;
  updateEmployee: (
    id: string,
    name: string,
    jobCategory: JobCategory,
    contractType: ContractType,
  ) => void;
  deleteEmployee: (employeeId: string) => void;
  importEmployees: (
    employees: readonly { name: string; jobCategory: JobCategory; contractType: ContractType }[],
  ) => void;
  loadSyntheticSample: () => void;
  addPhotos: (photos: readonly PhotoItem[]) => void;
  removePhoto: (photoId: string) => void;
  toggleIgnorePhoto: (photoId: string) => void;
  ignoreAllLeftoverPhotos: () => void;
  linkPhoto: (employeeId: string, photoId: string) => void;
  unlinkPhoto: (employeeId: string) => void;
  replaceLink: (employeeId: string, photoId: string) => void;
  selectEmployee: (employeeId: string | null) => void;
  setEditorFilter: (filter: "all" | "needsReview") => void;
  updateCrop: (employeeId: string, crop: CropRect, zoom?: number) => void;
  panCropRelative: (
    employeeId: string,
    deltaRatioX: number,
    deltaRatioY: number,
  ) => void;
  zoomCropRelative: (employeeId: string, newZoom: number) => void;
  resetToAuto: (employeeId: string) => void;
  resetToCover: (employeeId: string) => void;
  confirmIssues: (employeeId: string) => void;
  confirmLowRes: (employeeId: string) => void;
  setGeneratingPdf: (isGenerating: boolean, error?: string) => void;
  toggleCalibrationMarks: (enabled: boolean) => void;
  resetSession: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  const faceDetectorRef = useRef<FaceDetectorClient | null>(null);

  if (!faceDetectorRef.current) {
    faceDetectorRef.current = new FaceDetectorClient();
  }
  const faceDetector = faceDetectorRef.current;

  // Initialize Nanum Gothic Font
  useEffect(() => {
    let active = true;
    loadNanumGothicFont()
      .then(({ font, fontBytes }) => {
        if (active) {
          dispatch({ type: "FONT_LOADED", font, fontBytes });
        }
      })
      .catch((err) => {
        if (active) {
          dispatch({
            type: "FONT_ERROR",
            error: err instanceof Error ? err.message : "글꼴을 로드하지 못했습니다.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // Automatic Face Detection Trigger when a link is made without an edit
  useEffect(() => {
    for (const link of state.links) {
      const existingEdit = state.edits[link.employeeId];
      if (existingEdit) continue;

      const photo = state.photos.find((p) => p.id === link.photoId);
      if (!photo) continue;

      const cover = computeCoverCrop(photo.width, photo.height);
      const initialNorm = normalizeRect(cover, photo.width, photo.height);

      // Create initial fallback edit immediately
      const initialEdit: EmployeeEdit = {
        employeeId: link.employeeId,
        photoId: link.photoId,
        revision: 1,
        crop: cover,
        normalizedCrop: initialNorm,
        autoCrop: cover,
        zoom: 1.0,
        detectionStatus: "running",
        faceCount: 0,
        faces: [],
        issues: [],
        confirmedIssues: false,
        confirmedLowRes: false,
        manuallyEdited: false,
      };

      dispatch({
        type: "SET_DETECTION_RESULT",
        employeeId: link.employeeId,
        edit: initialEdit,
      });

      // Prepare ImageBitmap and run detector in Worker
      createImageBitmap(photo.canvas)
        .then((bitmap) => faceDetector.detectFaces(bitmap, photo.width, photo.height))
        .then((result) => {
          const autoCrop = result.cropResult.crop;
          const norm = normalizeRect(autoCrop, photo.width, photo.height);

          const finalEdit: EmployeeEdit = {
            employeeId: link.employeeId,
            photoId: link.photoId,
            revision: 1,
            crop: autoCrop,
            normalizedCrop: norm,
            autoCrop,
            zoom: result.cropResult.zoom,
            detectionStatus: result.success ? "done" : "fallback",
            faceCount: result.faceCount,
            faces: result.faces,
            issues: result.cropResult.issues,
            confirmedIssues: result.cropResult.issues.length === 0,
            confirmedLowRes: false,
            manuallyEdited: false,
          };

          dispatch({
            type: "SET_DETECTION_RESULT",
            employeeId: link.employeeId,
            edit: finalEdit,
          });
        })
        .catch((err) => {
          console.warn("Face detection error:", err);
          dispatch({
            type: "SET_DETECTION_RESULT",
            employeeId: link.employeeId,
            edit: {
              ...initialEdit,
              detectionStatus: "error",
            },
          });
        });
    }
  }, [state.links, state.photos, state.edits, faceDetector]);

  // Clean up workers and assets on unmount
  useEffect(() => {
    return () => {
      faceDetectorRef.current?.terminate();
      revokeAllPhotos(state.photos);
    };
  }, []);

  // Summary counts computation
  const summaryCounts = useMemo<SummaryCounts>(() => {
    const totalEmployees = state.employees.length;
    const matchedCount = state.links.length;
    const unmatchedEmployeesCount = totalEmployees - matchedCount;

    const linkedPhotoIds = new Set(state.links.map((l) => l.photoId));
    const unmatchedPhotosCount = state.photos.filter(
      (p) => !p.ignored && !linkedPhotoIds.has(p.id),
    ).length;

    const empKeyCounts = new Map<string, number>();
    for (const emp of state.employees) {
      empKeyCounts.set(emp.matchKey, (empKeyCounts.get(emp.matchKey) ?? 0) + 1);
    }
    const homonymCount = state.employees.filter(
      (e) => (empKeyCounts.get(e.matchKey) ?? 0) > 1,
    ).length;

    let autoCompletedCount = 0;
    let reviewRequiredCount = 0;

    for (const edit of Object.values(state.edits)) {
      const hasUnconfirmedIssue = edit.issues.length > 0 && !edit.confirmedIssues;
      const isLowRes =
        edit.crop.width < IMAGING_CONSTANTS.MIN_PRINT_WIDTH_PX ||
        edit.crop.height < IMAGING_CONSTANTS.MIN_PRINT_HEIGHT_PX;
      const hasUnconfirmedLowRes = isLowRes && !edit.confirmedLowRes;

      if (hasUnconfirmedIssue || hasUnconfirmedLowRes) {
        reviewRequiredCount++;
      } else {
        autoCompletedCount++;
      }
    }

    return {
      totalEmployees,
      matchedCount,
      unmatchedEmployeesCount,
      unmatchedPhotosCount,
      homonymCount,
      autoCompletedCount,
      reviewRequiredCount,
    };
  }, [state.employees, state.photos, state.links, state.edits]);

  // Blocking issues calculation
  const blockingIssues = useMemo<BlockingIssue[]>(() => {
    const issues: BlockingIssue[] = [];

    // Stage 1 issues
    if (state.employees.length === 0) {
      issues.push({
        code: "NO_EMPLOYEES",
        stage: 1,
        title: "직원 정보 없음",
        description: "최소 1명 이상의 직원을 직접 추가하거나 XLSX 파일로 불러와 주세요.",
      });
    }

    // Stage 2 issues
    const linkedEmpIds = new Set(state.links.map((l) => l.employeeId));
    const unlinkedEmps = state.employees.filter((e) => !linkedEmpIds.has(e.id));
    if (unlinkedEmps.length > 0) {
      issues.push({
        code: "UNLINKED_EMPLOYEES",
        stage: 2,
        title: "사진 미연결 직원",
        description: `사진이 연결되지 않은 직원이 ${unlinkedEmps.length}명 있습니다. 모든 직원에게 사진을 연결해 주세요.`,
      });
    }

    const linkedPhotoIds = new Set(state.links.map((l) => l.photoId));
    const leftoverPhotos = state.photos.filter((p) => !p.ignored && !linkedPhotoIds.has(p.id));
    if (leftoverPhotos.length > 0) {
      issues.push({
        code: "LEFTOVER_PHOTOS",
        stage: 2,
        title: "남는 사진 존재",
        description: `직원과 연결되지 않은 사진이 ${leftoverPhotos.length}장 있습니다. 사진을 삭제하거나 '남는 사진 무시'를 선택해 주세요.`,
      });
    }

    // Stage 3 & 4: Name layout & font glyph validation
    if (state.font) {
      for (const emp of state.employees) {
        const layout = computeNameLayout(emp.name, state.font);
        if (!layout.fits) {
          if (layout.error === "MISSING_GLYPH") {
            issues.push({
              code: "MISSING_GLYPH",
              stage: 3,
              title: "글꼴 미지원 문자",
              description: `[직원 #${emp.order} ${emp.name}] 나눔고딕 글꼴에 포함되지 않은 문자(${layout.missingGlyphs?.join(", ") ?? ""})가 있어 인쇄용 PDF를 생성할 수 없습니다. 이름을 수정해 주세요.`,
              targetId: emp.id,
            });
          } else if (layout.error === "NAME_OVERFLOW") {
            issues.push({
              code: "NAME_OVERFLOW",
              stage: 3,
              title: "이름 영역 초과",
              description: `[직원 #${emp.order} ${emp.name}] 이름이 허용 영역(2줄, 9pt)을 초과합니다. 이름을 줄여주세요.`,
              targetId: emp.id,
            });
          } else {
            issues.push({
              code: "NAME_LAYOUT_ERROR",
              stage: 3,
              title: "이름 배치 오류",
              description: `[직원 #${emp.order} ${emp.name}] ${layout.errorMessage ?? "이름 배치에 실패했습니다."}`,
              targetId: emp.id,
            });
          }
        }
      }
    } else if (state.fontError) {
      issues.push({
        code: "FONT_ERROR",
        stage: 4,
        title: "글꼴 로딩 실패",
        description: state.fontError,
      });
    }

    // Stage 3 issues: Unconfirmed warnings & low resolution
    for (const emp of state.employees) {
      const edit = state.edits[emp.id];
      if (!edit) {
        if (linkedEmpIds.has(emp.id)) {
          issues.push({
            code: "EDIT_PROCESSING",
            stage: 3,
            title: "사진 처리 중",
            description: `[직원 #${emp.order} ${emp.name}] 사진 얼굴 검출이 아직 진행 중입니다.`,
            targetId: emp.id,
          });
        }
        continue;
      }

      if (edit.issues.length > 0 && !edit.confirmedIssues) {
        const msg = edit.issues.map((i) => i.message).join(" ");
        issues.push({
          code: "UNCONFIRMED_FACE_ISSUE",
          stage: 3,
          title: "사진 확인 필요",
          description: `[직원 #${emp.order} ${emp.name}] ${msg} 편집 화면에서 구도를 확인한 뒤 '이 사진 사용'을 눌러주세요.`,
          targetId: emp.id,
        });
      }

      const isLowRes =
        edit.crop.width < IMAGING_CONSTANTS.MIN_PRINT_WIDTH_PX ||
        edit.crop.height < IMAGING_CONSTANTS.MIN_PRINT_HEIGHT_PX;
      if (isLowRes && !edit.confirmedLowRes) {
        issues.push({
          code: "UNCONFIRMED_LOW_RES",
          stage: 3,
          title: "저해상도 확인 필요",
          description: `[직원 #${emp.order} ${emp.name}] 사진 크롭 해상도가 권장 인쇄 품질(265 × 311px) 미만입니다. 인쇄 확인을 완료해 주세요.`,
          targetId: emp.id,
        });
      }
    }

    return issues;
  }, [
    state.employees,
    state.photos,
    state.links,
    state.edits,
    state.font,
    state.fontError,
  ]);

  const canProceedToStep2 = state.employees.length > 0;
  const canProceedToStep3 =
    state.employees.length > 0 &&
    state.links.length === state.employees.length &&
    summaryCounts.unmatchedPhotosCount === 0;

  const step3Issues = blockingIssues.filter((i) => i.stage <= 3);
  const canProceedToStep4 = canProceedToStep3 && step3Issues.length === 0;
  const canGeneratePdf =
    canProceedToStep4 &&
    state.font !== null &&
    !state.isGeneratingPdf &&
    blockingIssues.length === 0;

  // Dispatch helpers
  const setStep = useCallback((step: 1 | 2 | 3 | 4) => {
    dispatch({ type: "SET_STEP", step });
  }, []);

  const addEmployee = useCallback(
    (name: string, jobCategory: JobCategory, contractType: ContractType) => {
      const cleanName = name.trim().replace(/\s+/gu, " ");
      if (!cleanName) return;

      const employee: Employee = {
        id: `emp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        order: state.employees.length + 1,
        name: cleanName,
        matchKey: normalizeMatchKey(cleanName),
        jobCategory,
        contractType,
      };
      dispatch({ type: "ADD_EMPLOYEE", employee });
    },
    [state.employees.length],
  );

  const updateEmployee = useCallback(
    (id: string, name: string, jobCategory: JobCategory, contractType: ContractType) => {
      const cleanName = name.trim().replace(/\s+/gu, " ");
      if (!cleanName) return;

      const existing = state.employees.find((e) => e.id === id);
      if (!existing) return;

      const updated: Employee = {
        ...existing,
        name: cleanName,
        matchKey: normalizeMatchKey(cleanName),
        jobCategory,
        contractType,
      };
      dispatch({ type: "UPDATE_EMPLOYEE", employee: updated });
    },
    [state.employees],
  );

  const deleteEmployee = useCallback((employeeId: string) => {
    dispatch({ type: "DELETE_EMPLOYEE", employeeId });
  }, []);

  const importEmployees = useCallback(
    (
      newEmployees: readonly {
        name: string;
        jobCategory: JobCategory;
        contractType: ContractType;
      }[],
    ) => {
      const built: Employee[] = newEmployees.map((item, idx) => ({
        id: `emp_import_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        order: 0, // will be assigned in reducer
        name: item.name.trim().replace(/\s+/gu, " "),
        matchKey: normalizeMatchKey(item.name),
        jobCategory: item.jobCategory,
        contractType: item.contractType,
      }));
      dispatch({ type: "IMPORT_EMPLOYEES", employees: built });
    },
    [],
  );

  const loadSyntheticSample = useCallback(() => {
    const sampleEmps = generateSyntheticEmployees();
    dispatch({ type: "IMPORT_EMPLOYEES", employees: sampleEmps });
  }, []);

  const addPhotos = useCallback((photos: readonly PhotoItem[]) => {
    dispatch({ type: "ADD_PHOTOS", photos });
  }, []);

  const removePhoto = useCallback((photoId: string) => {
    dispatch({ type: "REMOVE_PHOTO", photoId });
  }, []);

  const toggleIgnorePhoto = useCallback((photoId: string) => {
    dispatch({ type: "TOGGLE_IGNORE_PHOTO", photoId });
  }, []);

  const ignoreAllLeftoverPhotos = useCallback(() => {
    dispatch({ type: "IGNORE_ALL_LEFTOVER_PHOTOS" });
  }, []);

  const linkPhoto = useCallback((employeeId: string, photoId: string) => {
    dispatch({ type: "LINK_PHOTO", employeeId, photoId, mode: "manual" });
  }, []);

  const unlinkPhoto = useCallback((employeeId: string) => {
    dispatch({ type: "UNLINK_PHOTO", employeeId });
  }, []);

  const replaceLink = useCallback((employeeId: string, photoId: string) => {
    dispatch({ type: "REPLACE_LINK", employeeId, photoId });
  }, []);

  const selectEmployee = useCallback((employeeId: string | null) => {
    dispatch({ type: "SELECT_EMPLOYEE", employeeId });
  }, []);

  const setEditorFilter = useCallback((filter: "all" | "needsReview") => {
    dispatch({ type: "SET_EDITOR_FILTER", filter });
  }, []);

  const updateCrop = useCallback(
    (employeeId: string, crop: CropRect, zoom?: number) => {
      const link = state.links.find((l) => l.employeeId === employeeId);
      if (!link) return;
      const photo = state.photos.find((p) => p.id === link.photoId);
      if (!photo) return;

      dispatch({
        type: "UPDATE_EDIT_CROP",
        employeeId,
        crop,
        zoom,
        width: photo.width,
        height: photo.height,
      });
    },
    [state.links, state.photos],
  );

  const panCropRelative = useCallback(
    (employeeId: string, deltaRatioX: number, deltaRatioY: number) => {
      const edit = state.edits[employeeId];
      const link = state.links.find((l) => l.employeeId === employeeId);
      if (!edit || !link) return;
      const photo = state.photos.find((p) => p.id === link.photoId);
      if (!photo) return;

      const deltaX = edit.crop.width * deltaRatioX;
      const deltaY = edit.crop.height * deltaRatioY;
      const newCrop = panCrop(edit.crop, photo.width, photo.height, deltaX, deltaY);

      dispatch({
        type: "UPDATE_EDIT_CROP",
        employeeId,
        crop: newCrop,
        zoom: edit.zoom,
        width: photo.width,
        height: photo.height,
      });
    },
    [state.edits, state.links, state.photos],
  );

  const zoomCropRelative = useCallback(
    (employeeId: string, newZoom: number) => {
      const edit = state.edits[employeeId];
      const link = state.links.find((l) => l.employeeId === employeeId);
      if (!edit || !link) return;
      const photo = state.photos.find((p) => p.id === link.photoId);
      if (!photo) return;

      const newCrop = computeZoomedCrop(edit.crop, photo.width, photo.height, newZoom);
      dispatch({
        type: "UPDATE_EDIT_CROP",
        employeeId,
        crop: newCrop,
        zoom: newZoom,
        width: photo.width,
        height: photo.height,
      });
    },
    [state.edits, state.links, state.photos],
  );

  const resetToAuto = useCallback(
    (employeeId: string) => {
      const link = state.links.find((l) => l.employeeId === employeeId);
      if (!link) return;
      const photo = state.photos.find((p) => p.id === link.photoId);
      if (!photo) return;

      dispatch({
        type: "RESET_EDIT_TO_AUTO",
        employeeId,
        width: photo.width,
        height: photo.height,
      });
    },
    [state.links, state.photos],
  );

  const resetToCover = useCallback(
    (employeeId: string) => {
      const link = state.links.find((l) => l.employeeId === employeeId);
      if (!link) return;
      const photo = state.photos.find((p) => p.id === link.photoId);
      if (!photo) return;

      dispatch({
        type: "RESET_EDIT_TO_COVER",
        employeeId,
        width: photo.width,
        height: photo.height,
      });
    },
    [state.links, state.photos],
  );

  const confirmIssues = useCallback((employeeId: string) => {
    dispatch({ type: "CONFIRM_ISSUES", employeeId });
  }, []);

  const confirmLowRes = useCallback((employeeId: string) => {
    dispatch({ type: "CONFIRM_LOW_RES", employeeId });
  }, []);

  const setGeneratingPdf = useCallback((isGenerating: boolean, error?: string) => {
    dispatch({ type: "SET_GENERATING_PDF", isGenerating, error });
  }, []);

  const toggleCalibrationMarks = useCallback((enabled: boolean) => {
    dispatch({ type: "TOGGLE_CALIBRATION_MARKS", enabled });
  }, []);

  const resetSession = useCallback(() => {
    faceDetector.terminate();
    dispatch({ type: "RESET_SESSION" });
  }, [faceDetector]);

  const value: SessionContextValue = {
    state,
    summaryCounts,
    blockingIssues,
    canProceedToStep2,
    canProceedToStep3,
    canProceedToStep4,
    canGeneratePdf,
    faceDetector,
    setStep,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    importEmployees,
    loadSyntheticSample,
    addPhotos,
    removePhoto,
    toggleIgnorePhoto,
    ignoreAllLeftoverPhotos,
    linkPhoto,
    unlinkPhoto,
    replaceLink,
    selectEmployee,
    setEditorFilter,
    updateCrop,
    panCropRelative,
    zoomCropRelative,
    resetToAuto,
    resetToCover,
    confirmIssues,
    confirmLowRes,
    setGeneratingPdf,
    toggleCalibrationMarks,
    resetSession,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
