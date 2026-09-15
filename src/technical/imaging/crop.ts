import {
  IMAGING_CONSTANTS,
  type CropRect,
  type CropResult,
  type ImagingIssue,
  type NormalizedRect,
  type Point,
} from "./types";

function clamp(value: number, min: number, max: number): number {
  if (min > max) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Computes center cover crop in accordance with TRD §7.2:
 * hCover = min(H, W / r)
 * wCover = r * hCover
 * cover = ((W - wCover) / 2, (H - hCover) / 2, wCover, hCover)
 */
export function computeCoverCrop(width: number, height: number): CropRect {
  const r = IMAGING_CONSTANTS.ASPECT_RATIO;
  const hCover = Math.min(height, width / r);
  const wCover = r * hCover;
  return {
    x: (width - wCover) / 2,
    y: (height - hCover) / 2,
    width: wCover,
    height: hCover,
  };
}

export interface ComputeFaceCropParams {
  readonly width: number;
  readonly height: number;
  readonly faceBox: CropRect;
  readonly eyeCenter?: Point;
}

/**
 * Computes face-based crop in accordance with TRD §7.2:
 * hDesired = faceH / 0.55
 * hCrop = clamp(hDesired, hCover / zoomMax, hCover)
 * wCrop = r * hCrop
 * x = clamp(faceX - 0.50 * wCrop, 0, W - wCrop)
 * y = clamp(eyeY - 0.38 * hCrop, 0, H - hCrop)
 */
export function computeFaceCrop({
  width,
  height,
  faceBox,
  eyeCenter,
}: ComputeFaceCropParams): CropResult {
  const r = IMAGING_CONSTANTS.ASPECT_RATIO;
  const cover = computeCoverCrop(width, height);
  const hCover = cover.height;
  const zoomMax = IMAGING_CONSTANTS.MAX_ZOOM;

  const isEyeCenterValid =
    eyeCenter !== undefined &&
    Number.isFinite(eyeCenter.x) &&
    Number.isFinite(eyeCenter.y);

  const faceH = faceBox.height;
  const faceX = faceBox.x + faceBox.width / 2;
  const eyeY = isEyeCenterValid
    ? eyeCenter.y
    : faceBox.y + faceBox.height * 0.35;

  const hDesired = faceH / IMAGING_CONSTANTS.TARGET_FACE_HEIGHT_RATIO;
  const hCrop = clamp(hDesired, hCover / zoomMax, hCover);
  const wCrop = r * hCrop;

  const x = clamp(faceX - 0.50 * wCrop, 0, width - wCrop);
  const y = clamp(eyeY - IMAGING_CONSTANTS.TARGET_EYE_Y_RATIO * hCrop, 0, height - hCrop);

  const crop: CropRect = { x, y, width: wCrop, height: hCrop };
  const zoom = hCover / hCrop;

  const issues: ImagingIssue[] = [];

  // TRD §7.2: 눈 기준점이 없거나 좌표가 유효하지 않으면 자동 성공으로 표시하지 않는다.
  if (!isEyeCenterValid) {
    issues.push({
      code: "COMPOSITION_DEVIATION",
      message: "눈 기준점이 없거나 유효하지 않아 자동 완료할 수 없습니다. 수동 확인이 필요합니다.",
      severity: "warning",
      requiresConfirmation: true,
    });
  }

  // TRD §9.4 Low resolution check (< 265 x 311px)
  if (
    wCrop < IMAGING_CONSTANTS.MIN_PRINT_WIDTH_PX ||
    hCrop < IMAGING_CONSTANTS.MIN_PRINT_HEIGHT_PX
  ) {
    issues.push({
      code: "LOW_RESOLUTION",
      message: "저해상도 경고: 크롭 영역이 인쇄 권장 해상도(265 × 311px) 미만입니다.",
      severity: "warning",
      requiresConfirmation: true,
    });
  }

  // TRD §7.2 Deviation & Edge Clipping check
  const actualFaceRatio = faceH / hCrop;
  const faceRatioDev = Math.abs(actualFaceRatio - IMAGING_CONSTANTS.TARGET_FACE_HEIGHT_RATIO);

  const actualEyeLevel = (eyeY - y) / hCrop;
  const eyeLevelDev = Math.abs(actualEyeLevel - IMAGING_CONSTANTS.TARGET_EYE_Y_RATIO);

  const isEdgeClipped =
    faceBox.x < x ||
    faceBox.y < y ||
    faceBox.x + faceBox.width > x + wCrop ||
    faceBox.y + faceBox.height > y + hCrop;

  if (isEdgeClipped) {
    issues.push({
      code: "EDGE_CLIPPED",
      message: "얼굴 경계가 크롭 영역 바깥으로 잘립니다.",
      severity: "warning",
      requiresConfirmation: true,
    });
  }

  if (
    faceRatioDev > IMAGING_CONSTANTS.ALLOWED_DEVIATION ||
    eyeLevelDev > IMAGING_CONSTANTS.ALLOWED_DEVIATION
  ) {
    issues.push({
      code: "COMPOSITION_DEVIATION",
      message: `구도 편차 초과: 목표 구도(얼굴 55%, 눈높이 38%) 대비 편차가 5%p를 초과합니다.`,
      severity: "warning",
      requiresConfirmation: true,
    });
  }

  const requiresConfirmation = issues.some((i) => i.requiresConfirmation);

  return {
    crop,
    normalizedCrop: normalizeRect(crop, width, height),
    zoom,
    isAuto: true,
    method: "face",
    issues,
    requiresConfirmation,
    actualFaceRatio,
    actualEyeLevel,
  };
}

/**
 * Updates zoom with center preservation in accordance with TRD §8:
 * zoom = hCover / crop.height (range 1~5).
 * When zoom changes, the crop center (centerX, centerY) is preserved, clamping to image bounds.
 */
export function computeZoomedCrop(
  currentCrop: CropRect,
  width: number,
  height: number,
  newZoom: number,
): CropRect {
  const r = IMAGING_CONSTANTS.ASPECT_RATIO;
  const hCover = computeCoverCrop(width, height).height;
  const clampedZoom = clamp(
    newZoom,
    IMAGING_CONSTANTS.MIN_ZOOM,
    IMAGING_CONSTANTS.MAX_ZOOM,
  );

  const newHeight = hCover / clampedZoom;
  const newWidth = r * newHeight;

  const centerX = currentCrop.x + currentCrop.width / 2;
  const centerY = currentCrop.y + currentCrop.height / 2;

  const newX = clamp(centerX - newWidth / 2, 0, width - newWidth);
  const newY = clamp(centerY - newHeight / 2, 0, height - newHeight);

  return {
    x: newX,
    y: newY,
    width: newWidth,
    height: newHeight,
  };
}

/**
 * Pans the crop window.
 * Note TRD §8: Moving the photo right means moving the crop window left (opposite direction).
 * deltaX / deltaY are in pixels of the original image space.
 */
export function panCrop(
  currentCrop: CropRect,
  width: number,
  height: number,
  cropDeltaX: number,
  cropDeltaY: number,
): CropRect {
  const newX = clamp(currentCrop.x + cropDeltaX, 0, width - currentCrop.width);
  const newY = clamp(currentCrop.y + cropDeltaY, 0, height - currentCrop.height);

  return {
    ...currentCrop,
    x: newX,
    y: newY,
  };
}

/**
 * Normalized coordinates [0, 1] for resolution-independent storage.
 */
export function normalizeRect(
  rect: CropRect,
  width: number,
  height: number,
): NormalizedRect {
  return {
    x: rect.x / width,
    y: rect.y / height,
    width: rect.width / width,
    height: rect.height / height,
  };
}

/**
 * Denormalizes coordinates from [0, 1] back to original pixel coordinates.
 */
export function denormalizeRect(
  norm: NormalizedRect,
  width: number,
  height: number,
): CropRect {
  return {
    x: norm.x * width,
    y: norm.y * height,
    width: norm.width * width,
    height: norm.height * height,
  };
}

/**
 * Verifies roundtrip coordinate conversion accuracy (TRD roundtrip requirement <= 1px).
 */
export function verifyRoundtrip(
  crop: CropRect,
  width: number,
  height: number,
): { maxErrorPx: number; passed: boolean } {
  const norm = normalizeRect(crop, width, height);
  const restored = denormalizeRect(norm, width, height);

  const errorX = Math.abs(restored.x - crop.x);
  const errorY = Math.abs(restored.y - crop.y);
  const errorW = Math.abs(restored.width - crop.width);
  const errorH = Math.abs(restored.height - crop.height);

  const maxErrorPx = Math.max(errorX, errorY, errorW, errorH);
  return {
    maxErrorPx,
    passed: maxErrorPx <= 1.0,
  };
}

/**
 * Checks low resolution condition (TRD §9.4).
 */
export function checkLowResolution(crop: CropRect): boolean {
  return (
    crop.width < IMAGING_CONSTANTS.MIN_PRINT_WIDTH_PX ||
    crop.height < IMAGING_CONSTANTS.MIN_PRINT_HEIGHT_PX
  );
}
