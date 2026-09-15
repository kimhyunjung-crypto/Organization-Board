import {
  SPREADSHEET_LIMITS,
  rejectedResult,
  type SpreadsheetParseResult,
  type SpreadsheetWorkerRequest,
  type SpreadsheetWorkerResponse,
} from "./types";

export interface SpreadsheetWorkerPort {
  onmessage: ((event: MessageEvent<SpreadsheetWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: SpreadsheetWorkerRequest, transfer: Transferable[]): void;
  terminate(): void;
}

export type SpreadsheetWorkerFactory = () => SpreadsheetWorkerPort;

export interface SpreadsheetParseOptions {
  readonly batchId?: string;
  readonly timeoutMs?: number;
  readonly workerFactory?: SpreadsheetWorkerFactory;
  readonly technicalDelayMs?: number;
}

function defaultWorkerFactory(): SpreadsheetWorkerPort {
  return new Worker(new URL("../../workers/spreadsheet.worker.ts", import.meta.url), {
    type: "module",
    name: "spreadsheet-parser",
  });
}

function createId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

export function validateSpreadsheetFile(file: Pick<File, "name" | "size">, batchId: string): SpreadsheetParseResult | null {
  if (!file.name.toLocaleLowerCase("en-US").endsWith(".xlsx")) {
    return rejectedResult(batchId, { code: "INVALID_EXTENSION", detail: ".xlsx 파일만 시험할 수 있습니다." });
  }
  if (file.size === 0) {
    return rejectedResult(batchId, { code: "EMPTY_FILE", detail: "빈 파일은 읽을 수 없습니다." });
  }
  if (file.size > SPREADSHEET_LIMITS.maxFileBytes) {
    return rejectedResult(batchId, {
      code: "FILE_TOO_LARGE",
      detail: `파일 크기가 ${SPREADSHEET_LIMITS.maxFileBytes.toLocaleString("en-US")}바이트 한도를 초과했습니다.`,
    });
  }
  return null;
}

export async function parseSpreadsheetFile(
  file: File,
  options: SpreadsheetParseOptions = {},
): Promise<SpreadsheetParseResult> {
  const batchId = options.batchId ?? createId("batch");
  const envelopeFailure = validateSpreadsheetFile(file, batchId);
  if (envelopeFailure) {
    return envelopeFailure;
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return rejectedResult(batchId, { code: "FILE_READ_FAILED", detail: "브라우저가 선택한 파일을 읽지 못했습니다." });
  }

  let worker: SpreadsheetWorkerPort;
  try {
    worker = (options.workerFactory ?? defaultWorkerFactory)();
  } catch {
    return rejectedResult(batchId, { code: "WORKER_FAILED", detail: "XLSX Worker를 시작하지 못했습니다." });
  }
  const requestId = createId("request");
  const timeoutMs = options.timeoutMs ?? SPREADSHEET_LIMITS.workerTimeoutMs;

  return new Promise((resolve) => {
    let completed = false;
    const finish = (result: SpreadsheetParseResult) => {
      if (completed) {
        return;
      }
      completed = true;
      clearTimeout(timeout);
      worker.terminate();
      resolve(result);
    };
    const timeout = setTimeout(() => {
      finish(rejectedResult(batchId, {
        code: "WORKER_TIMEOUT",
        detail: `Worker가 ${timeoutMs.toLocaleString("en-US")}ms 제한 안에 완료되지 않았습니다.`,
      }));
    }, timeoutMs);

    worker.onmessage = (event) => {
      if (event.data.requestId !== requestId) {
        return;
      }
      if (event.data.type === "success") {
        finish(event.data.result);
      } else {
        finish(rejectedResult(event.data.batchId, event.data.error));
      }
    };
    worker.onerror = () => {
      finish(rejectedResult(batchId, { code: "WORKER_FAILED", detail: "XLSX Worker 실행에 실패했습니다." }));
    };
    worker.onmessageerror = () => {
      finish(rejectedResult(batchId, { code: "WORKER_FAILED", detail: "XLSX Worker 응답을 읽지 못했습니다." }));
    };

    const request: SpreadsheetWorkerRequest = {
      type: "parse",
      requestId,
      batchId,
      bytes,
      technicalDelayMs: options.technicalDelayMs,
    };
    try {
      worker.postMessage(request, [bytes]);
    } catch {
      finish(rejectedResult(batchId, { code: "WORKER_FAILED", detail: "XLSX 데이터를 Worker로 보내지 못했습니다." }));
    }
  });
}
