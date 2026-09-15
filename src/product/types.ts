import type { CropRect, FaceDetectionData, ImagingIssue, NormalizedRect } from "../technical/imaging/types";
import type { ContractType, FontkitFont, JobCategory, NameLayout } from "../technical/pdf/types";

export type { ContractType, JobCategory };

export const JOB_CATEGORIES: readonly JobCategory[] = [
  "디자인",
  "서비스",
  "개발",
  "백오피스",
  "QA",
] as const;

export const CONTRACT_TYPES: readonly ContractType[] = [
  "정규직",
  "계약직",
  "아르바이트",
  "파견직",
  "인턴",
] as const;

export interface Employee {
  readonly id: string;
  readonly order: number;
  readonly name: string;
  readonly matchKey: string;
  readonly jobCategory: JobCategory;
  readonly contractType: ContractType;
  readonly sourceRow?: number;
}

export interface PhotoRecord {
  readonly id: string;
  readonly fileName: string;
  readonly matchKey: string;
  readonly objectUrl: string;
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly exifOrientation: number;
  readonly ignored: boolean;
}

export type PhotoItem = PhotoRecord;

export interface PhotoLink {
  readonly employeeId: string;
  readonly photoId: string;
  readonly mode: "auto" | "manual";
  readonly revision: number;
}

export interface EmployeeEdit {
  readonly employeeId: string;
  readonly photoId: string;
  readonly revision: number;
  readonly crop: CropRect;
  readonly normalizedCrop: NormalizedRect;
  readonly autoCrop?: CropRect;
  readonly zoom: number;
  readonly detectionStatus: "queued" | "running" | "done" | "fallback" | "error";
  readonly faceCount: number;
  readonly faces: readonly FaceDetectionData[];
  readonly issues: readonly ImagingIssue[];
  readonly confirmedIssues: boolean;
  readonly confirmedLowRes: boolean;
  readonly manuallyEdited: boolean;
}

export interface ProductSessionState {
  readonly step: 1 | 2 | 3 | 4;
  readonly employees: readonly Employee[];
  readonly photos: readonly PhotoRecord[];
  readonly links: readonly PhotoLink[];
  readonly edits: Readonly<Record<string, EmployeeEdit>>;
  readonly selectedEmployeeId: string | null;
  readonly editorFilter: "all" | "needsReview";
  readonly font: FontkitFont | null;
  readonly fontBytes: Uint8Array | null;
  readonly fontLoading: boolean;
  readonly fontError: string | null;
  readonly isGeneratingPdf: boolean;
  readonly pdfGenerationError: string | null;
  readonly includeCalibrationMarks: boolean;
}

export interface SummaryCounts {
  readonly totalEmployees: number;
  readonly matchedCount: number;
  readonly unmatchedEmployeesCount: number;
  readonly unmatchedPhotosCount: number;
  readonly homonymCount: number;
  readonly autoCompletedCount: number;
  readonly reviewRequiredCount: number;
}

export interface BlockingIssue {
  readonly code: string;
  readonly stage: 1 | 2 | 3 | 4;
  readonly title: string;
  readonly description: string;
  readonly targetId?: string;
}

export interface CachedNameValidation {
  readonly layout: NameLayout;
  readonly isBlocked: boolean;
  readonly errorMessage?: string;
}
