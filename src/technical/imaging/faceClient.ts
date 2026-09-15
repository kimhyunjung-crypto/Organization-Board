/**
 * S00.03 Face Detector Worker Client & Manager
 * Enforces 10s inference timeout, terminates and recreates worker on timeout,
 * and handles automatic fallback to cover crop in accordance with TRD §7.3.
 */

import { computeCoverCrop, computeFaceCrop, normalizeRect } from "./crop";
import {
  IMAGING_CONSTANTS,
  type CropResult,
  type FaceDetectionData,
  type ImagingIssue,
} from "./types";
import type { WorkerDetectRequest, WorkerDetectResponse } from "../../workers/face.worker";

export interface FaceDetectionClientResult {
  readonly success: boolean;
  readonly faceCount: number;
  readonly faces: readonly FaceDetectionData[];
  readonly cropResult: CropResult;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly error?: string;
}

export class FaceDetectorClient {
  private worker: Worker | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (res: FaceDetectionClientResult) => void;
      timer: ReturnType<typeof setTimeout>;
      width: number;
      height: number;
      startTime: number;
    }
  >();
  private requestCounter = 0;

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL("../../workers/face.worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker.onmessage = this.handleWorkerMessage.bind(this);
      this.worker.onerror = this.handleWorkerError.bind(this);
      this.worker.onmessageerror = () => this.restartWorker();
    }
    return this.worker;
  }

  private handleWorkerMessage(event: MessageEvent<WorkerDetectResponse>): void {
    const data = event.data;
    if (!data || data.type !== "detect_result") return;

    const pending = this.pendingRequests.get(data.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingRequests.delete(data.id);

    const { width, height, startTime } = pending;
    const durationMs = performance.now() - startTime;

    if (!data.success) {
      // Model or inference error: Fallback to cover crop (TRD §7.3)
      const cover = computeCoverCrop(width, height);
      const issues: ImagingIssue[] = [
        {
          code: "DETECTION_FAILED",
          message: data.error ?? "얼굴 검출 중 오류가 발생했습니다. 중앙 기본 크롭으로 대체합니다.",
          severity: "warning",
          requiresConfirmation: true,
        },
      ];
      pending.resolve({
        success: false,
        faceCount: 0,
        faces: [],
        cropResult: {
          crop: cover,
          normalizedCrop: normalizeRect(cover, width, height),
          zoom: 1.0,
          isAuto: false,
          method: "cover",
          issues,
          requiresConfirmation: true,
        },
        durationMs,
        timedOut: false,
        error: data.error,
      });
      return;
    }

    const faces = data.faces;
    const faceCount = faces.length;

    if (faceCount === 0) {
      // TRD §7.3: 얼굴 없음 -> 중앙 cover, 확인 필요
      const cover = computeCoverCrop(width, height);
      const issues: ImagingIssue[] = [
        {
          code: "NO_FACE",
          message: "얼굴 미탐지: 얼굴을 감지하지 못했습니다. 수동으로 위치를 조정한 후 '이 사진 사용'을 눌러주세요.",
          severity: "info",
          requiresConfirmation: true,
        },
      ];
      pending.resolve({
        success: true,
        faceCount: 0,
        faces: [],
        cropResult: {
          crop: cover,
          normalizedCrop: normalizeRect(cover, width, height),
          zoom: 1.0,
          isAuto: true,
          method: "cover",
          issues,
          requiresConfirmation: true,
        },
        durationMs,
        timedOut: false,
      });
    } else if (faceCount === 1) {
      // TRD §7.3: 유효한 단일 얼굴 -> 얼굴 기준 크롭
      const face = faces[0];
      if (face) {
        const cropResult = computeFaceCrop({
          width,
          height,
          faceBox: face.boundingBox,
          eyeCenter: face.eyeCenter
            ? { x: face.eyeCenter.originalX, y: face.eyeCenter.originalY }
            : undefined,
        });

        pending.resolve({
          success: true,
          faceCount: 1,
          faces,
          cropResult,
          durationMs,
          timedOut: false,
        });
      } else {
        const cover = computeCoverCrop(width, height);
        pending.resolve({
          success: true,
          faceCount: 0,
          faces: [],
          cropResult: {
            crop: cover,
            normalizedCrop: normalizeRect(cover, width, height),
            zoom: 1.0,
            isAuto: true,
            method: "cover",
            issues: [],
            requiresConfirmation: true,
          },
          durationMs,
          timedOut: false,
        });
      }
    } else {
      // TRD §7.3: 여러 얼굴 -> 중앙 cover, 확인 필요
      const cover = computeCoverCrop(width, height);
      const issues: ImagingIssue[] = [
        {
          code: "MULTIPLE_FACES",
          message: `다중 얼굴: ${faceCount}명의 얼굴이 감지되었습니다. 원하는 인물로 위치를 조정한 후 '이 사진 사용'을 눌러주세요.`,
          severity: "warning",
          requiresConfirmation: true,
        },
      ];
      pending.resolve({
        success: true,
        faceCount,
        faces,
        cropResult: {
          crop: cover,
          normalizedCrop: normalizeRect(cover, width, height),
          zoom: 1.0,
          isAuto: true,
          method: "cover",
          issues,
          requiresConfirmation: true,
        },
        durationMs,
        timedOut: false,
      });
    }
  }

  private handleWorkerError(err: ErrorEvent): void {
    console.error("Worker error encountered:", err.message);
    this.restartWorker();
  }

  private restartWorker(): void {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // Ignore
      }
      this.worker = null;
    }
    // Any remaining pending requests are resolved with fallback
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      const cover = computeCoverCrop(pending.width, pending.height);
      pending.resolve({
        success: false,
        faceCount: 0,
        faces: [],
        cropResult: {
          crop: cover,
          normalizedCrop: normalizeRect(cover, pending.width, pending.height),
          zoom: 1.0,
          isAuto: false,
          method: "cover",
          issues: [
            {
              code: "DETECTION_FAILED",
              message: "Worker 오류로 인해 기본 중앙 크롭으로 대체되었습니다.",
              severity: "warning",
              requiresConfirmation: true,
            },
          ],
          requiresConfirmation: true,
        },
        durationMs: performance.now() - pending.startTime,
        timedOut: false,
        error: "WORKER_ERROR",
      });
      this.pendingRequests.delete(id);
    }
  }

  public async detectFaces(
    bitmap: ImageBitmap,
    width: number,
    height: number,
    timeoutMs: number = IMAGING_CONSTANTS.WORKER_TIMEOUT_MS,
  ): Promise<FaceDetectionClientResult> {
    const id = `req_${++this.requestCounter}_${Date.now()}`;
    const startTime = performance.now();

    return new Promise<FaceDetectionClientResult>((resolve) => {
      const timer = setTimeout(() => {
        // TRD §7.3: 10초 시간 초과 시 Worker를 재생성하고 cover fallback
        console.warn(`Face detection timed out after ${timeoutMs}ms for ${id}`);
        this.pendingRequests.delete(id);
        this.restartWorker();

        const cover = computeCoverCrop(width, height);
        resolve({
          success: false,
          faceCount: 0,
          faces: [],
          cropResult: {
            crop: cover,
            normalizedCrop: normalizeRect(cover, width, height),
            zoom: 1.0,
            isAuto: false,
            method: "cover",
            issues: [
              {
                code: "WORKER_TIMEOUT",
                message: "얼굴 검출 제한 시간(10초)이 초과되어 기본 중앙 크롭으로 대체되었습니다.",
                severity: "warning",
                requiresConfirmation: true,
              },
            ],
            requiresConfirmation: true,
          },
          durationMs: performance.now() - startTime,
          timedOut: true,
          error: "TIMEOUT_10S",
        });
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve,
        timer,
        width,
        height,
        startTime,
      });

      const request: WorkerDetectRequest = {
        id,
        type: "detect",
        imageBitmap: bitmap,
        width,
        height,
        maxDimension: IMAGING_CONSTANTS.DETECTOR_MAX_DIMENSION,
      };

      // Transfer ImageBitmap with zero copy
      try {
        this.ensureWorker().postMessage(request, [bitmap]);
      } catch {
        bitmap.close();
        this.restartWorker();
      }
    });
  }

  public terminate(): void {
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // Ignore
      }
      this.worker = null;
    }
    // Settle all in-flight pending work with cover fallback and clear timers
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      const cover = computeCoverCrop(pending.width, pending.height);
      pending.resolve({
        success: false,
        faceCount: 0,
        faces: [],
        cropResult: {
          crop: cover,
          normalizedCrop: normalizeRect(cover, pending.width, pending.height),
          zoom: 1.0,
          isAuto: false,
          method: "cover",
          issues: [
            {
              code: "DETECTION_FAILED",
              message: "클라이언트 종료로 인해 기본 중앙 크롭으로 대체되었습니다.",
              severity: "warning",
              requiresConfirmation: true,
            },
          ],
          requiresConfirmation: true,
        },
        durationMs: performance.now() - pending.startTime,
        timedOut: false,
        error: "TERMINATED",
      });
      this.pendingRequests.delete(id);
    }
    this.pendingRequests.clear();
  }
}
