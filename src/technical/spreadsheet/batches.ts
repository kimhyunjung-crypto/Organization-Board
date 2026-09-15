import type { SpreadsheetAcceptedResult, SpreadsheetParseResult } from "./types";

export interface SpreadsheetBatch {
  readonly batchId: string;
  readonly revision: number;
  readonly result: SpreadsheetAcceptedResult;
}

export type BatchIntent =
  | { readonly kind: "new" }
  | { readonly kind: "retry"; readonly batchId: string };

export function integrateSpreadsheetBatch(
  batches: readonly SpreadsheetBatch[],
  result: SpreadsheetParseResult,
  intent: BatchIntent,
): readonly SpreadsheetBatch[] {
  if (result.status === "rejected") {
    return batches;
  }

  if (intent.kind === "new") {
    if (batches.some((batch) => batch.batchId === result.batchId)) {
      throw new Error("새 가져오기 배치 ID가 이미 존재합니다.");
    }
    return [...batches, { batchId: result.batchId, revision: 1, result }];
  }

  const targetIndex = batches.findIndex((batch) => batch.batchId === intent.batchId);
  if (targetIndex < 0 || result.batchId !== intent.batchId) {
    throw new Error("재시도할 가져오기 배치를 찾을 수 없습니다.");
  }

  return batches.map((batch, index) =>
    index === targetIndex
      ? { batchId: batch.batchId, revision: batch.revision + 1, result }
      : batch,
  );
}

export function countIntegratedValidRows(batches: readonly SpreadsheetBatch[]): number {
  return batches.reduce((total, batch) => total + batch.result.validRows.length, 0);
}
