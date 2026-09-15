import ExcelJS, { type CellValue, type Worksheet } from "exceljs";
import { SpreadsheetGuardError, inspectXlsxZip } from "./zipGuard";
import {
  ALLOWED_CONTRACT_TYPES,
  ALLOWED_JOB_CATEGORIES,
  REQUIRED_COLUMNS,
  SPREADSHEET_LIMITS,
  type ParsedSpreadsheetRow,
  type RequiredColumn,
  type SpreadsheetAcceptedResult,
  type SpreadsheetFailure,
  type SpreadsheetRowIssue,
  type SpreadsheetRowIssueCode,
} from "./types";

interface ReadCellSuccess {
  readonly ok: true;
  readonly value: string;
}

interface ReadCellFailure {
  readonly ok: false;
  readonly code: SpreadsheetRowIssueCode;
}

type ReadCellResult = ReadCellSuccess | ReadCellFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeSpreadsheetText(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function readStringCell(value: CellValue): ReadCellResult {
  if (value === null || value === undefined || value === "") {
    return { ok: true, value: "" };
  }
  if (typeof value === "string") {
    return { ok: true, value: normalizeSpreadsheetText(value) };
  }
  if (typeof value === "number") {
    return { ok: false, code: "NUMBER_NOT_ALLOWED" };
  }
  if (typeof value === "boolean") {
    return { ok: false, code: "BOOLEAN_NOT_ALLOWED" };
  }
  if (value instanceof Date) {
    return { ok: false, code: "DATE_NOT_ALLOWED" };
  }
  if (isRecord(value) && ("formula" in value || "sharedFormula" in value)) {
    return { ok: false, code: "FORMULA_NOT_ALLOWED" };
  }
  if (isRecord(value) && "hyperlink" in value) {
    return { ok: false, code: "HYPERLINK_NOT_ALLOWED" };
  }
  if (isRecord(value) && "error" in value) {
    return { ok: false, code: "CELL_ERROR_NOT_ALLOWED" };
  }
  if (isRecord(value) && Array.isArray(value.richText)) {
    const richText = value.richText;
    if (richText.every((part) => isRecord(part) && typeof part.text === "string")) {
      return {
        ok: true,
        value: normalizeSpreadsheetText(richText.map((part) => part.text).join("")),
      };
    }
  }
  return { ok: false, code: "UNSUPPORTED_CELL_TYPE" };
}

function headerText(value: CellValue): string {
  const result = readStringCell(value);
  return result.ok ? result.value : "";
}

function findRequiredColumns(worksheet: Worksheet): {
  readonly indexes: Readonly<Record<RequiredColumn, number>>;
  readonly extraColumns: number;
} {
  const headerRow = worksheet.getRow(1);
  const found = new Map<RequiredColumn, number[]>();
  let extraColumns = 0;

  for (let columnIndex = 1; columnIndex <= worksheet.columnCount; columnIndex += 1) {
    const cell = headerRow.getCell(columnIndex);
    const text = headerText(cell.value);
    if (text === "") {
      continue;
    }
    if (REQUIRED_COLUMNS.includes(text as RequiredColumn)) {
      if (cell.isMerged) {
        throw new SpreadsheetGuardError("MERGED_REQUIRED_CELL", "필수 헤더 셀이 병합됐습니다.");
      }
      const column = text as RequiredColumn;
      found.set(column, [...(found.get(column) ?? []), columnIndex]);
    } else {
      extraColumns += 1;
    }
  }

  if (REQUIRED_COLUMNS.some((column) => (found.get(column)?.length ?? 0) > 1)) {
    throw new SpreadsheetGuardError("DUPLICATE_REQUIRED_HEADER", "필수 헤더가 중복됩니다.");
  }
  if (REQUIRED_COLUMNS.some((column) => !found.has(column))) {
    throw new SpreadsheetGuardError("MISSING_REQUIRED_HEADER", "필수 헤더가 누락됐습니다.");
  }

  return {
    indexes: {
      이름: found.get("이름")?.[0] as number,
      직군: found.get("직군")?.[0] as number,
      계약형태: found.get("계약형태")?.[0] as number,
    },
    extraColumns,
  };
}

function pushIssue(
  issues: SpreadsheetRowIssue[],
  sourceRow: number,
  column: RequiredColumn,
  code: SpreadsheetRowIssueCode,
): void {
  issues.push({ sourceRow, column, code });
}

function isAllowedJobCategory(value: string): value is ParsedSpreadsheetRow["jobCategory"] {
  return ALLOWED_JOB_CATEGORIES.includes(value as ParsedSpreadsheetRow["jobCategory"]);
}

function isAllowedContractType(value: string): value is ParsedSpreadsheetRow["contractType"] {
  return ALLOWED_CONTRACT_TYPES.includes(value as ParsedSpreadsheetRow["contractType"]);
}

function parseVisibleWorksheet(worksheet: Worksheet, batchId: string): SpreadsheetAcceptedResult {
  if (Math.max(0, worksheet.rowCount - 1) > SPREADSHEET_LIMITS.maxDataRows) {
    throw new SpreadsheetGuardError(
      "ROWS_EXCEEDED",
      `데이터 행 ${SPREADSHEET_LIMITS.maxDataRows.toLocaleString("en-US")}개 한도를 초과했습니다.`,
    );
  }

  const { indexes, extraColumns } = findRequiredColumns(worksheet);
  const validRows: ParsedSpreadsheetRow[] = [];
  const invalidRows: SpreadsheetRowIssue[] = [];
  let totalDataRows = 0;
  let ignoredEmptyRows = 0;

  for (let sourceRow = 2; sourceRow <= worksheet.rowCount; sourceRow += 1) {
    const row = worksheet.getRow(sourceRow);
    const cells = REQUIRED_COLUMNS.map((column) => ({
      column,
      cell: row.getCell(indexes[column]),
    }));

    if (cells.some(({ cell }) => cell.isMerged)) {
      throw new SpreadsheetGuardError(
        "MERGED_REQUIRED_CELL",
        `필수 영역의 ${sourceRow.toLocaleString("en-US")}행에 병합 셀이 있습니다.`,
      );
    }

    const readings = cells.map(({ column, cell }) => ({ column, result: readStringCell(cell.value) }));
    if (readings.every(({ result }) => result.ok && result.value === "")) {
      ignoredEmptyRows += 1;
      continue;
    }

    totalDataRows += 1;
    const issueStart = invalidRows.length;
    for (const reading of readings) {
      if (!reading.result.ok) {
        pushIssue(invalidRows, sourceRow, reading.column, reading.result.code);
      } else if (reading.result.value === "") {
        pushIssue(invalidRows, sourceRow, reading.column, "REQUIRED_VALUE_MISSING");
      }
    }

    if (invalidRows.length !== issueStart) {
      continue;
    }

    const values = Object.fromEntries(
      readings.map(({ column, result }) => [column, result.ok ? result.value : ""]),
    ) as Record<RequiredColumn, string>;

    if (!isAllowedJobCategory(values.직군)) {
      pushIssue(invalidRows, sourceRow, "직군", "JOB_CATEGORY_NOT_ALLOWED");
    }
    if (!isAllowedContractType(values.계약형태)) {
      pushIssue(invalidRows, sourceRow, "계약형태", "CONTRACT_TYPE_NOT_ALLOWED");
    }

    if (invalidRows.length === issueStart) {
      validRows.push({
        sourceRow,
        name: values.이름,
        jobCategory: values.직군 as ParsedSpreadsheetRow["jobCategory"],
        contractType: values.계약형태 as ParsedSpreadsheetRow["contractType"],
      });
    }
  }

  return {
    status: "accepted",
    batchId,
    validRows,
    invalidRows,
    warnings: extraColumns > 0 ? [{ code: "IGNORED_EXTRA_COLUMNS", count: extraColumns }] : [],
    summary: {
      totalDataRows,
      ignoredEmptyRows,
      validRows: validRows.length,
      invalidRows: new Set(invalidRows.map((issue) => issue.sourceRow)).size,
    },
  };
}

export async function parseSpreadsheetBytes(bytes: Uint8Array, batchId: string): Promise<SpreadsheetAcceptedResult> {
  inspectXlsxZip(bytes);

  const workbook = new ExcelJS.Workbook();
  try {
    // ExcelJS's declaration names Node Buffer, while its browser build accepts Uint8Array.
    await workbook.xlsx.load(bytes as never);
  } catch {
    throw new SpreadsheetGuardError("INVALID_XLSX", "ExcelJS가 XLSX 문서를 읽지 못했습니다.");
  }

  const worksheet = workbook.worksheets.find((candidate) => candidate.state === "visible");
  if (!worksheet) {
    throw new SpreadsheetGuardError("NO_VISIBLE_SHEET", "표시 상태인 시트가 없습니다.");
  }

  return parseVisibleWorksheet(worksheet, batchId);
}

export function guardErrorToFailure(error: unknown): SpreadsheetFailure {
  if (error instanceof SpreadsheetGuardError) {
    return { code: error.code, detail: error.message };
  }
  return { code: "INVALID_XLSX", detail: "XLSX 파싱 중 안전하게 분류할 수 없는 오류가 발생했습니다." };
}
