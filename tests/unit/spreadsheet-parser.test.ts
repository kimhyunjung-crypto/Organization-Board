import { describe, expect, it } from "vitest";
import { parseSpreadsheetBytes } from "../../src/technical/spreadsheet/parser";
import { SpreadsheetGuardError } from "../../src/technical/spreadsheet/zipGuard";
import {
  createCellTypeWorkbook,
  createHeaderProblemWorkbook,
  createMixedSyntheticWorkbook,
  createNoVisibleSheetWorkbook,
} from "../fixtures/spreadsheets/buildSyntheticWorkbook";

describe("ExcelJS spreadsheet parser", () => {
  it("reads the first visible sheet and returns mixed rows without exposing invalid cell values", async () => {
    const result = await parseSpreadsheetBytes(await createMixedSyntheticWorkbook(), "batch-mixed");

    expect(result.summary).toEqual({
      totalDataRows: 6,
      ignoredEmptyRows: 1,
      validRows: 3,
      invalidRows: 3,
    });
    expect(result.validRows.map((row) => row.name)).toEqual([
      "합성 인물 001",
      "합성 인물 005",
      "합성 인물 001",
    ]);
    expect(result.invalidRows).toEqual([
      { sourceRow: 3, column: "이름", code: "FORMULA_NOT_ALLOWED" },
      { sourceRow: 4, column: "직군", code: "HYPERLINK_NOT_ALLOWED" },
      { sourceRow: 5, column: "계약형태", code: "NUMBER_NOT_ALLOWED" },
    ]);
    expect(JSON.stringify(result.invalidRows)).not.toContain("1+1");
    expect(JSON.stringify(result.invalidRows)).not.toContain("example.invalid");
    expect(result.warnings).toEqual([{ code: "IGNORED_EXTRA_COLUMNS", count: 1 }]);
  });

  it.each([
    ["duplicate", "DUPLICATE_REQUIRED_HEADER"],
    ["missing", "MISSING_REQUIRED_HEADER"],
    ["merged", "MERGED_REQUIRED_CELL"],
  ] as const)("rejects the %s required-column case", async (kind, code) => {
    await expect(parseSpreadsheetBytes(await createHeaderProblemWorkbook(kind), `batch-${kind}`)).rejects.toMatchObject({
      code,
    });
  });

  it("rejects a workbook with no visible sheet", async () => {
    await expect(parseSpreadsheetBytes(await createNoVisibleSheetWorkbook(), "batch-hidden")).rejects.toMatchObject({
      code: "NO_VISIBLE_SHEET",
    });
  });

  it("classifies date, boolean, and error cells without returning their values", async () => {
    const bytes = await createCellTypeWorkbook([
      new Date("2026-01-01T00:00:00.000Z"),
      true,
      { error: "#N/A" },
    ]);
    const result = await parseSpreadsheetBytes(bytes, "batch-types");

    expect(result.validRows).toEqual([]);
    expect(result.invalidRows.map((issue) => issue.code)).toEqual([
      "DATE_NOT_ALLOWED",
      "BOOLEAN_NOT_ALLOWED",
      "CELL_ERROR_NOT_ALLOWED",
    ]);
  });

  it("uses a typed guard error for rejected files", () => {
    const error = new SpreadsheetGuardError("INVALID_XLSX", "safe detail");
    expect(error).toMatchObject({ code: "INVALID_XLSX", message: "safe detail" });
  });
});
