import { Zip, ZipDeflate, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseSpreadsheetBytes } from "../../src/technical/spreadsheet/parser";
import { inspectXlsxZip } from "../../src/technical/spreadsheet/zipGuard";
import { SPREADSHEET_LIMITS } from "../../src/technical/spreadsheet/types";
import { validateSpreadsheetFile } from "../../src/technical/spreadsheet/client";
import { createRowLimitWorkbook } from "../fixtures/spreadsheets/buildSyntheticWorkbook";

const encoder = new TextEncoder();
const minimumXlsxEntries = {
  "[Content_Types].xml": encoder.encode("<Types />"),
  "xl/workbook.xml": encoder.encode("<workbook />"),
};

function concatenate(chunks: readonly Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

function streamingZip(files: Readonly<Record<string, Uint8Array>>): Uint8Array {
  const chunks: Uint8Array[] = [];
  let zipError: Error | null = null;
  const zip = new Zip((error, data) => {
    if (error) {
      zipError = error;
      return;
    }
    chunks.push(data);
  });

  Object.entries(files).forEach(([name, bytes]) => {
    const entry = new ZipDeflate(name, { level: 9 });
    zip.add(entry);
    entry.push(bytes, true);
  });
  zip.end();

  if (zipError) {
    throw zipError;
  }
  return concatenate(chunks);
}

describe("XLSX resource guards", () => {
  it("rejects wrong extensions, empty files, and files over 5MiB before a Worker starts", () => {
    expect(validateSpreadsheetFile({ name: "synthetic.xls", size: 10 }, "batch-a")).toMatchObject({
      error: { code: "INVALID_EXTENSION" },
    });
    expect(validateSpreadsheetFile({ name: "synthetic.xlsx", size: 0 }, "batch-b")).toMatchObject({
      error: { code: "EMPTY_FILE" },
    });
    expect(validateSpreadsheetFile(
      { name: "synthetic.xlsx", size: SPREADSHEET_LIMITS.maxFileBytes + 1 },
      "batch-c",
    )).toMatchObject({ error: { code: "FILE_TOO_LARGE" } });
    expect(validateSpreadsheetFile(
      { name: "synthetic.XLSX", size: SPREADSHEET_LIMITS.maxFileBytes },
      "batch-boundary",
    )).toBeNull();
  });

  it("rejects more than 2,000 ZIP entries", () => {
    const files: Record<string, Uint8Array> = { ...minimumXlsxEntries };
    for (let index = 0; index < SPREADSHEET_LIMITS.maxZipEntries - 1; index += 1) {
      files[`xl/synthetic/item-${index}.xml`] = new Uint8Array(0);
    }

    expect(() => inspectXlsxZip(zipSync(files))).toThrowError(expect.objectContaining({
      code: "ZIP_ENTRIES_EXCEEDED",
    }));
  });

  it("rejects a declared ZIP expansion over 50MiB", () => {
    const bytes = zipSync({
      ...minimumXlsxEntries,
      "xl/synthetic/declared-limit.bin": new Uint8Array(SPREADSHEET_LIMITS.maxUncompressedBytes + 1),
    }, { level: 9 });

    expect(() => inspectXlsxZip(bytes)).toThrowError(expect.objectContaining({
      code: "ZIP_DECLARED_SIZE_EXCEEDED",
    }));
  });

  it("measures streamed output and stops actual expansion over 50MiB when local sizes are absent", () => {
    const bytes = streamingZip({
      ...minimumXlsxEntries,
      "xl/synthetic/actual-limit.bin": new Uint8Array(SPREADSHEET_LIMITS.maxUncompressedBytes + 1),
    });

    expect(() => inspectXlsxZip(bytes)).toThrowError(expect.objectContaining({
      code: "ZIP_ACTUAL_SIZE_EXCEEDED",
    }));
  });

  it("rejects truncated archives and missing XLSX structure", () => {
    const validZip = zipSync(minimumXlsxEntries);
    expect(() => inspectXlsxZip(validZip.subarray(0, validZip.length - 8))).toThrowError(expect.objectContaining({
      code: "INVALID_XLSX",
    }));
    expect(() => inspectXlsxZip(zipSync({ "synthetic.txt": encoder.encode("synthetic") }))).toThrowError(
      expect.objectContaining({ code: "XLSX_STRUCTURE_MISSING" }),
    );
  });

  it("rejects duplicate and traversal-like ZIP entry paths", () => {
    const duplicate = streamingZip({
      ...minimumXlsxEntries,
      "xl/synthetic.xml": encoder.encode("first"),
    });
    const duplicateChunks: Uint8Array[] = [];
    const duplicateZip = new Zip((_error, data) => duplicateChunks.push(data));
    ["[Content_Types].xml", "xl/workbook.xml", "xl/workbook.xml"].forEach((name) => {
      const entry = new ZipDeflate(name);
      duplicateZip.add(entry);
      entry.push(encoder.encode("synthetic"), true);
    });
    duplicateZip.end();

    expect(inspectXlsxZip(duplicate).entries).toBe(3);
    expect(() => inspectXlsxZip(concatenate(duplicateChunks))).toThrowError(expect.objectContaining({
      code: "INVALID_XLSX",
    }));
    expect(() => inspectXlsxZip(zipSync({
      ...minimumXlsxEntries,
      "xl/../synthetic.xml": encoder.encode("synthetic"),
    }))).toThrowError(expect.objectContaining({ code: "UNSAFE_ZIP_ENTRY" }));
  });

  it("accepts exactly 1,000 data rows and rejects the next row", async () => {
    const boundary = await parseSpreadsheetBytes(
      await createRowLimitWorkbook(SPREADSHEET_LIMITS.maxDataRows),
      "batch-row-boundary",
    );
    expect(boundary.summary.validRows).toBe(SPREADSHEET_LIMITS.maxDataRows);

    await expect(parseSpreadsheetBytes(
      await createRowLimitWorkbook(SPREADSHEET_LIMITS.maxDataRows + 1),
      "batch-row-limit",
    )).rejects.toMatchObject({ code: "ROWS_EXCEEDED" });
  });
});
