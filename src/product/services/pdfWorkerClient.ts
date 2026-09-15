import type {
  DocumentRenderPlan,
  GenerateBoardPdfOptions,
} from "../../technical/pdf/types";
import type {
  WorkerPdfPhoto,
  WorkerPdfRequest,
  WorkerPdfResponse,
} from "../../workers/pdf.worker";

export interface GeneratePdfJob {
  readonly promise: Promise<Uint8Array>;
  cancel: () => void;
}

/**
 * Executes PDF generation inside a dedicated Web Worker.
 * Ensures the heavy pdf-lib compilation, font embedding, and vector drawing
 * run entirely off the main thread.
 *
 * Supports immediate user cancellation via worker.terminate().
 */
export function generatePdfViaWorker(
  documentPlan: DocumentRenderPlan,
  fontBytes: Uint8Array,
  photos: readonly { employeeId: string; photoBytes: Uint8Array }[],
  options?: GenerateBoardPdfOptions,
  timeoutMs: number = 60_000,
): GeneratePdfJob {
  let worker: Worker | null = new Worker(
    new URL("../../workers/pdf.worker.ts", import.meta.url),
    { type: "module", name: "pdf-generator" },
  );

  const requestId = `pdf_req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let rejectFn: ((reason?: unknown) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (worker) {
      worker.terminate();
      worker = null;
    }
    if (rejectFn) {
      rejectFn(new Error("PDF 생성이 사용자에 의해 취소되었습니다."));
      rejectFn = null;
    }
  };

  const promise = new Promise<Uint8Array>((resolve, reject) => {
    rejectFn = reject;

    if (!worker) {
      reject(new Error("PDF Worker를 초기화하지 못했습니다."));
      return;
    }

    timer = setTimeout(() => {
      cancel();
      reject(new Error(`PDF 생성이 제한 시간(${timeoutMs / 1000}초)을 초과했습니다.`));
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<WorkerPdfResponse>) => {
      const data = event.data;
      if (!data || data.requestId !== requestId) return;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (worker) {
        worker.terminate();
        worker = null;
      }

      if (data.type === "success") {
        resolve(new Uint8Array(data.pdfBytes));
      } else {
        reject(new Error(data.error));
      }
    };

    worker.onerror = (err) => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (worker) {
        worker.terminate();
        worker = null;
      }
      reject(new Error(`PDF Worker 실행 오류: ${err.message || "알 수 없는 오류"}`));
    };

    // Prepare transferables: fontBytes copy and photo buffers
    const fontBufferCopy = fontBytes.slice().buffer;
    const workerPhotos: WorkerPdfPhoto[] = photos.map((p) => {
      const copy = p.photoBytes.slice().buffer;
      return {
        employeeId: p.employeeId,
        photoBytes: copy,
      };
    });

    const transferables: Transferable[] = [
      fontBufferCopy,
      ...workerPhotos.map((p) => p.photoBytes),
    ];

    const request: WorkerPdfRequest = {
      type: "generate",
      requestId,
      documentPlan,
      fontBytes: fontBufferCopy,
      photos: workerPhotos,
      options,
    };

    worker.postMessage(request, transferables);
  });

  return { promise, cancel };
}
