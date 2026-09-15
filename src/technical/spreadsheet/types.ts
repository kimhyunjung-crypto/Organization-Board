export const SPREADSHEET_LIMITS = {
  maxFileBytes: 5 * 1024 * 1024,
  maxDataRows: 1_000,
  maxUncompressedBytes: 50 * 1024 * 1024,
  maxZipEntries: 2_000,
  workerTimeoutMs: 10_000,
} as const;

export const REQUIRED_COLUMNS = ["이름", "직군", "계약형태"] as const;
export type RequiredColumn = (typeof REQUIRED_COLUMNS)[number];

export const ALLOWED_JOB_CATEGORIES = ["디자인", "서비스", "개발", "백오피스", "QA"] as const;
export const ALLOWED_CONTRACT_TYPES = ["정규직", "계약직", "아르바이트", "파견직", "인턴"] as const;

export type SpreadsheetErrorCode =
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "INVALID_EXTENSION"
  | "INVALID_XLSX"
  | "UNSAFE_ZIP_ENTRY"
  | "ZIP_ENTRIES_EXCEEDED"
  | "ZIP_DECLARED_SIZE_EXCEEDED"
  | "ZIP_ACTUAL_SIZE_EXCEEDED"
  | "XLSX_STRUCTURE_MISSING"
  | "NO_VISIBLE_SHEET"
  | "ROWS_EXCEEDED"
  | "MISSING_REQUIRED_HEADER"
  | "DUPLICATE_REQUIRED_HEADER"
  | "MERGED_REQUIRED_CELL"
  | "WORKER_TIMEOUT"
  | "WORKER_FAILED"
  | "FILE_READ_FAILED";

export type SpreadsheetRowIssueCode =
  | "REQUIRED_VALUE_MISSING"
  | "FORMULA_NOT_ALLOWED"
  | "HYPERLINK_NOT_ALLOWED"
  | "NUMBER_NOT_ALLOWED"
  | "DATE_NOT_ALLOWED"
  | "BOOLEAN_NOT_ALLOWED"
  | "CELL_ERROR_NOT_ALLOWED"
  | "UNSUPPORTED_CELL_TYPE"
  | "JOB_CATEGORY_NOT_ALLOWED"
  | "CONTRACT_TYPE_NOT_ALLOWED";

export interface SpreadsheetFailure {
  readonly code: SpreadsheetErrorCode;
  readonly detail?: string;
}

export interface SpreadsheetRowIssue {
  readonly sourceRow: number;
  readonly column: RequiredColumn;
  readonly code: SpreadsheetRowIssueCode;
}

export interface ParsedSpreadsheetRow {
  readonly sourceRow: number;
  readonly name: string;
  readonly jobCategory: (typeof ALLOWED_JOB_CATEGORIES)[number];
  readonly contractType: (typeof ALLOWED_CONTRACT_TYPES)[number];
}

export interface SpreadsheetWarning {
  readonly code: "IGNORED_EXTRA_COLUMNS";
  readonly count: number;
}

export interface SpreadsheetParseSummary {
  readonly totalDataRows: number;
  readonly ignoredEmptyRows: number;
  readonly validRows: number;
  readonly invalidRows: number;
}

export interface SpreadsheetAcceptedResult {
  readonly status: "accepted";
  readonly batchId: string;
  readonly validRows: readonly ParsedSpreadsheetRow[];
  readonly invalidRows: readonly SpreadsheetRowIssue[];
  readonly warnings: readonly SpreadsheetWarning[];
  readonly summary: SpreadsheetParseSummary;
}

export interface SpreadsheetRejectedResult {
  readonly status: "rejected";
  readonly batchId: string;
  readonly error: SpreadsheetFailure;
}

export type SpreadsheetParseResult = SpreadsheetAcceptedResult | SpreadsheetRejectedResult;

export interface SpreadsheetWorkerRequest {
  readonly type: "parse";
  readonly requestId: string;
  readonly batchId: string;
  readonly bytes: ArrayBuffer;
  readonly technicalDelayMs?: number;
}

export type SpreadsheetWorkerResponse =
  | {
      readonly type: "success";
      readonly requestId: string;
      readonly result: SpreadsheetAcceptedResult;
    }
  | {
      readonly type: "failure";
      readonly requestId: string;
      readonly batchId: string;
      readonly error: SpreadsheetFailure;
    };

export function rejectedResult(batchId: string, error: SpreadsheetFailure): SpreadsheetRejectedResult {
  return { status: "rejected", batchId, error };
}
