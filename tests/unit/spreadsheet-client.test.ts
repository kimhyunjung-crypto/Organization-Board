import { describe, expect, it, vi } from "vitest";
import { countIntegratedValidRows, integrateSpreadsheetBatch, type SpreadsheetBatch } from "../../src/technical/spreadsheet/batches";
import { parseSpreadsheetFile, type SpreadsheetWorkerPort } from "../../src/technical/spreadsheet/client";
import { SPREADSHEET_LIMITS, type SpreadsheetAcceptedResult } from "../../src/technical/spreadsheet/types";

function acceptedResult(batchId: string, sourceRows: readonly number[]): SpreadsheetAcceptedResult {
  return {
    status: "accepted",
    batchId,
    validRows: sourceRows.map((sourceRow) => ({
      sourceRow,
      name: `합성 인물 ${sourceRow}`,
      jobCategory: "QA",
      contractType: "인턴",
    })),
    invalidRows: [],
    warnings: [],
    summary: {
      totalDataRows: sourceRows.length,
      ignoredEmptyRows: 0,
      validRows: sourceRows.length,
      invalidRows: 0,
    },
  };
}

function syntheticFile(): File {
  return new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "synthetic.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("spreadsheet batch retry contract", () => {
  it("replaces a retry in place so valid rows are not duplicated", () => {
    const first = acceptedResult("batch-1", [2, 3]);
    const initial = integrateSpreadsheetBatch([], first, { kind: "new" });
    const retried = integrateSpreadsheetBatch(initial, acceptedResult("batch-1", [2, 3, 4]), {
      kind: "retry",
      batchId: "batch-1",
    });

    expect(retried).toHaveLength(1);
    expect(retried[0]?.revision).toBe(2);
    expect(countIntegratedValidRows(retried)).toBe(3);
  });

  it("keeps the exact previous state when a retry is rejected", () => {
    const initial: readonly SpreadsheetBatch[] = [{
      batchId: "batch-1",
      revision: 1,
      result: acceptedResult("batch-1", [2]),
    }];
    const afterFailure = integrateSpreadsheetBatch(initial, {
      status: "rejected",
      batchId: "batch-1",
      error: { code: "INVALID_XLSX" },
    }, { kind: "retry", batchId: "batch-1" });

    expect(afterFailure).toBe(initial);
  });
});

describe("spreadsheet Worker client", () => {
  it("terminates an unresponsive Worker at the 10,000ms contract", async () => {
    vi.useFakeTimers();
    const terminate = vi.fn();
    const worker: SpreadsheetWorkerPort = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage: vi.fn(),
      terminate,
    };

    try {
      const resultPromise = parseSpreadsheetFile(syntheticFile(), {
        batchId: "batch-timeout",
        workerFactory: () => worker,
      });
      await vi.advanceTimersByTimeAsync(SPREADSHEET_LIMITS.workerTimeoutMs);

      await expect(resultPromise).resolves.toMatchObject({
        status: "rejected",
        error: { code: "WORKER_TIMEOUT" },
      });
      expect(terminate).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a structured failure when Worker construction throws", async () => {
    await expect(parseSpreadsheetFile(syntheticFile(), {
      batchId: "batch-constructor-failure",
      workerFactory: () => {
        throw new Error("untrusted runtime detail");
      },
    })).resolves.toEqual({
      status: "rejected",
      batchId: "batch-constructor-failure",
      error: { code: "WORKER_FAILED", detail: "XLSX Worker를 시작하지 못했습니다." },
    });
  });

  it("terminates the Worker and clears the timer when postMessage throws", async () => {
    vi.useFakeTimers();
    const terminate = vi.fn();
    const worker: SpreadsheetWorkerPort = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage: () => {
        throw new DOMException("clone detail", "DataCloneError");
      },
      terminate,
    };

    try {
      await expect(parseSpreadsheetFile(syntheticFile(), {
        batchId: "batch-clone-failure",
        workerFactory: () => worker,
      })).resolves.toMatchObject({ status: "rejected", error: { code: "WORKER_FAILED" } });
      expect(terminate).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
