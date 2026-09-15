import { guardErrorToFailure, parseSpreadsheetBytes } from "../technical/spreadsheet/parser";
import type { SpreadsheetWorkerRequest, SpreadsheetWorkerResponse } from "../technical/spreadsheet/types";

interface SpreadsheetWorkerScope {
  onmessage: ((event: MessageEvent<SpreadsheetWorkerRequest>) => void) | null;
  postMessage(message: SpreadsheetWorkerResponse): void;
}

const workerScope = self as unknown as SpreadsheetWorkerScope;

workerScope.onmessage = (event) => {
  const request = event.data;
  if (request.type !== "parse") {
    return;
  }

  void (async () => {
    try {
      if (request.technicalDelayMs && request.technicalDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, request.technicalDelayMs));
      }
      const result = await parseSpreadsheetBytes(new Uint8Array(request.bytes), request.batchId);
      workerScope.postMessage({ type: "success", requestId: request.requestId, result });
    } catch (error) {
      workerScope.postMessage({
        type: "failure",
        requestId: request.requestId,
        batchId: request.batchId,
        error: guardErrorToFailure(error),
      });
    }
  })();
};
