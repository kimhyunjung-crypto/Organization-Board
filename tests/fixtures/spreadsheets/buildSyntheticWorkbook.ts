import ExcelJS, { type CellValue, type Worksheet } from "exceljs";

export interface SyntheticWorkbookOptions {
  readonly hiddenPrelude?: boolean;
  readonly extraHeader?: boolean;
}

async function workbookBytes(workbook: ExcelJS.Workbook): Promise<Uint8Array> {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

function addRequiredHeaders(worksheet: Worksheet): void {
  worksheet.addRow(["이름", "직군", "계약형태"]);
}

export async function createMixedSyntheticWorkbook(
  options: SyntheticWorkbookOptions = { hiddenPrelude: true, extraHeader: true },
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Synthetic POC-06 fixture";

  if (options.hiddenPrelude) {
    const hidden = workbook.addWorksheet("합성 안내", { state: "hidden" });
    hidden.addRow(["이 시트는 표시 시트 선택 시험용 합성 안내입니다."]);
  }

  const input = workbook.addWorksheet("합성 입력");
  input.addRow(options.extraHeader ? ["이름", "직군", "계약형태", "무시할 열"] : ["이름", "직군", "계약형태"]);
  input.addRow(["  합성   인물 001  ", "개발(CE)", "정규직", "합성 메모"]);
  input.addRow([{ formula: "1+1", result: 2 }, "QA", "계약직"]);
  input.addRow(["합성 인물 003", { text: "합성 링크", hyperlink: "https://example.invalid" }, "인턴"]);
  input.addRow(["합성 인물 004", "서비스", 20260915]);
  input.addRow([
    { richText: [{ text: "합성 " }, { text: "인물 005", font: { bold: true } }] },
    "디자인",
    "아르바이트",
  ]);
  input.addRow([null, null, null]);
  input.addRow(["합성 인물 001", "백오피스(BP)", "파견직"]);

  return workbookBytes(workbook);
}

export async function createHeaderProblemWorkbook(kind: "duplicate" | "missing" | "merged"): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const input = workbook.addWorksheet("합성 입력");

  if (kind === "duplicate") {
    input.addRow(["이름", "직군", "계약형태", " 이름 "]);
  } else if (kind === "missing") {
    input.addRow(["이름", "직군"]);
  } else {
    addRequiredHeaders(input);
    input.mergeCells("A2:A3");
  }
  input.addRow(["합성 인물 001", "QA", "인턴"]);

  return workbookBytes(workbook);
}

export async function createNoVisibleSheetWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const hidden = workbook.addWorksheet("합성 숨김", { state: "hidden" });
  addRequiredHeaders(hidden);
  hidden.addRow(["합성 인물 001", "QA", "인턴"]);
  return workbookBytes(workbook);
}

export async function createRowLimitWorkbook(dataRows: number): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const input = workbook.addWorksheet("합성 입력");
  addRequiredHeaders(input);
  for (let index = 1; index <= dataRows; index += 1) {
    input.addRow([`합성 인물 ${index.toString().padStart(4, "0")}`, "QA", "인턴"]);
  }
  return workbookBytes(workbook);
}

export async function createCellTypeWorkbook(values: readonly CellValue[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const input = workbook.addWorksheet("합성 입력");
  addRequiredHeaders(input);
  values.forEach((value, index) => {
    input.addRow([value, "QA", index % 2 === 0 ? "인턴" : "정규직"]);
  });
  return workbookBytes(workbook);
}
