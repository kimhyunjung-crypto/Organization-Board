import { generateBoardPdf } from "../technical/pdf/pdfGenerator";
import type {
  CardRenderPlan,
  DocumentRenderPlan,
  GenerateBoardPdfOptions,
  PhotoProvider,
} from "../technical/pdf/types";

export interface WorkerPdfPhoto {
  readonly employeeId: string;
  readonly photoBytes: ArrayBuffer;
}

export interface WorkerPdfRequest {
  readonly type: "generate";
  readonly requestId: string;
  readonly documentPlan: DocumentRenderPlan;
  readonly fontBytes: ArrayBuffer;
  readonly photos: readonly WorkerPdfPhoto[];
  readonly options?: GenerateBoardPdfOptions;
}

export type WorkerPdfResponse =
  | {
      readonly type: "success";
      readonly requestId: string;
      readonly pdfBytes: ArrayBuffer;
    }
  | {
      readonly type: "error";
      readonly requestId: string;
      readonly error: string;
    };

self.onmessage = async (event: MessageEvent<WorkerPdfRequest>) => {
  const data = event.data;
  if (!data || data.type !== "generate") return;

  const { requestId, documentPlan, fontBytes, photos, options } = data;

  try {
    const photoMap = new Map<string, Uint8Array>(
      photos.map((p) => [p.employeeId, new Uint8Array(p.photoBytes)]),
    );

    const photoProvider: PhotoProvider = async (card: CardRenderPlan) => {
      const bytes = photoMap.get(card.employeeId);
      if (!bytes) {
        throw new Error(`직원 #${card.employeeId}의 사진 데이터를 Worker에서 찾을 수 없습니다.`);
      }
      return bytes;
    };

    const pdfUint8 = await generateBoardPdf(
      documentPlan,
      new Uint8Array(fontBytes),
      photoProvider,
      options,
    );

    const response: WorkerPdfResponse = {
      type: "success",
      requestId,
      pdfBytes: pdfUint8.buffer as ArrayBuffer,
    };

    self.postMessage(response, [response.pdfBytes]);
  } catch (error) {
    const response: WorkerPdfResponse = {
      type: "error",
      requestId,
      error: error instanceof Error ? error.message : "PDF Worker 생성 중 오류가 발생했습니다.",
    };
    self.postMessage(response);
  }
};
