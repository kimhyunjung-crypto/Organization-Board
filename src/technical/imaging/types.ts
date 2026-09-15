/**
 * S00.03 Imaging types and constants
 * Defined in accordance with TRD sections 7, 8, 9.4 and FRD F4, F5.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FaceKeypoint {
  readonly x: number; // normalized [0, 1] relative to original image
  readonly y: number;
  readonly originalX: number; // pixel coordinate on original image
  readonly originalY: number;
  readonly label?: string;
  readonly score?: number;
}

export interface FaceDetectionData {
  readonly boundingBox: CropRect;
  readonly normalizedBox: NormalizedRect;
  readonly keypoints: readonly FaceKeypoint[];
  readonly eyeCenter?: {
    readonly originalX: number;
    readonly originalY: number;
    readonly normalizedX: number;
    readonly normalizedY: number;
  };
  readonly score?: number;
}

export type ImagingWarningCode =
  | "NO_FACE"
  | "MULTIPLE_FACES"
  | "COMPOSITION_DEVIATION"
  | "EDGE_CLIPPED"
  | "LOW_RESOLUTION"
  | "WORKER_TIMEOUT"
  | "DETECTION_FAILED";

export interface ImagingIssue {
  readonly code: ImagingWarningCode;
  readonly message: string;
  readonly severity: "warning" | "info" | "error";
  readonly requiresConfirmation: boolean;
}

export interface CropResult {
  readonly crop: CropRect;
  readonly normalizedCrop: NormalizedRect;
  readonly zoom: number;
  readonly isAuto: boolean;
  readonly method: "face" | "cover";
  readonly issues: readonly ImagingIssue[];
  readonly requiresConfirmation: boolean;
  readonly actualFaceRatio?: number;
  readonly actualEyeLevel?: number;
}

/**
 * Constants from TRD §7.2, §8, §9.4
 */
export const IMAGING_CONSTANTS = {
  /** Target photo aspect ratio r = 22.4 / 26.3 */
  ASPECT_RATIO: 22.4 / 26.3,
  CARD_PHOTO_WIDTH_MM: 22.4,
  CARD_PHOTO_HEIGHT_MM: 26.3,

  /** 300 ppi minimum print resolution (ceil(mm / 25.4 * 300)) */
  MIN_PRINT_WIDTH_PX: 265,
  MIN_PRINT_HEIGHT_PX: 311,

  /** Single face target proportions */
  TARGET_FACE_HEIGHT_RATIO: 0.55,
  TARGET_EYE_Y_RATIO: 0.38,
  ALLOWED_DEVIATION: 0.05, // 5%p

  /** Zoom boundaries relative to cover crop */
  MIN_ZOOM: 1.0,
  MAX_ZOOM: 5.0,

  /** Detector downscale constraint */
  DETECTOR_MAX_DIMENSION: 1280,

  /** Worker timeout constraint */
  WORKER_TIMEOUT_MS: 10_000,

  /** Keyboard pan step proportions (TRD §8) */
  PAN_STEP_RATIO: 0.005, // 0.5%
  PAN_SHIFT_STEP_RATIO: 0.025, // 2.5%
} as const;
