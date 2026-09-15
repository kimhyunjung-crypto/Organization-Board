/**
 * S00.03 Dedicated Face Detection Worker
 * Uses @mediapipe/tasks-vision 1.0.1 FaceDetector
 * Loads local WASM from /assets/mediapipe/wasm/ and model from /assets/models/blaze_face_short_range.tflite
 * Performs downscaling to max dimension 1280 (TRD §7.1)
 * Maps bounding boxes and eye landmarks back to original dimensions.
 */

import { FilesetResolver, FaceDetector } from "@mediapipe/tasks-vision";
import type { FaceDetectionData, FaceKeypoint } from "../technical/imaging/types";

let detectorPromise: Promise<FaceDetector> | null = null;

async function getDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks("/assets/mediapipe/wasm", true);
      return await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "/assets/models/blaze_face_short_range.tflite",
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.5,
      });
    })();
  }
  return detectorPromise;
}

export interface WorkerDetectRequest {
  readonly id: string;
  readonly type: "detect";
  readonly imageBitmap: ImageBitmap;
  readonly width: number;
  readonly height: number;
  readonly maxDimension?: number;
}

export interface WorkerDetectResponse {
  readonly id: string;
  readonly type: "detect_result";
  readonly success: boolean;
  readonly faces: readonly FaceDetectionData[];
  readonly originalWidth: number;
  readonly originalHeight: number;
  readonly durationMs: number;
  readonly error?: string;
}

self.onmessage = async (event: MessageEvent<WorkerDetectRequest>) => {
  const data = event.data;
  if (!data || data.type !== "detect") return;

  const startTime = performance.now();
  const { id, imageBitmap, width, height, maxDimension = 1280 } = data;

  try {
    const detector = await getDetector();

    // Downscale if image exceeds max dimension (TRD §7.1)
    let source: ImageBitmap | OffscreenCanvas = imageBitmap;
    let detectorW = width;
    let detectorH = height;

    const maxDim = Math.max(width, height);
    if (maxDim > maxDimension) {
      const scale = maxDimension / maxDim;
      detectorW = Math.round(width * scale);
      detectorH = Math.round(height * scale);

      const offscreen = new OffscreenCanvas(detectorW, detectorH);
      const ctx = offscreen.getContext("2d");
      if (!ctx) throw new Error("Detector Canvas context unavailable");
      ctx.drawImage(imageBitmap, 0, 0, detectorW, detectorH);
      source = offscreen;
    }

    const detectionResult = detector.detect(source);

    // Free the transferred ImageBitmap memory
    try {
      imageBitmap.close();
    } catch {
      // Ignore if already closed
    }

    const scaleX = width / detectorW;
    const scaleY = height / detectorH;

    const faces: FaceDetectionData[] = detectionResult.detections.map((detection) => {
      const b = detection.boundingBox ?? { originX: 0, originY: 0, width: 0, height: 0 };
      const originX = b.originX * scaleX;
      const originY = b.originY * scaleY;
      const boxW = b.width * scaleX;
      const boxH = b.height * scaleY;

      const keypoints: FaceKeypoint[] = (detection.keypoints ?? []).map((kp) => ({
        x: kp.x,
        y: kp.y,
        originalX: kp.x * width,
        originalY: kp.y * height,
        label: kp.label,
        score: kp.score,
      }));

      let eyeCenter: FaceDetectionData["eyeCenter"] = undefined;
      const eye0 = keypoints[0];
      const eye1 = keypoints[1];
      if (eye0 && eye1) {
        // In BlazeFace: index 0 = right eye, index 1 = left eye
        const eyeNormX = (eye0.x + eye1.x) / 2;
        const eyeNormY = (eye0.y + eye1.y) / 2;
        eyeCenter = {
          normalizedX: eyeNormX,
          normalizedY: eyeNormY,
          originalX: eyeNormX * width,
          originalY: eyeNormY * height,
        };
      }

      return {
        boundingBox: {
          x: originX,
          y: originY,
          width: boxW,
          height: boxH,
        },
        normalizedBox: {
          x: originX / width,
          y: originY / height,
          width: boxW / width,
          height: boxH / height,
        },
        keypoints,
        eyeCenter,
        score: detection.categories?.[0]?.score,
      };
    });

    const durationMs = performance.now() - startTime;
    const response: WorkerDetectResponse = {
      id,
      type: "detect_result",
      success: true,
      faces,
      originalWidth: width,
      originalHeight: height,
      durationMs,
    };

    self.postMessage(response);
  } catch (err) {
    try {
      imageBitmap.close();
    } catch {
      // Ignore
    }

    const response: WorkerDetectResponse = {
      id,
      type: "detect_result",
      success: false,
      faces: [],
      originalWidth: width,
      originalHeight: height,
      durationMs: performance.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
