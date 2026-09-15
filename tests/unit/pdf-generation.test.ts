import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { PAGE_CONSTANTS } from "../../src/technical/pdf/constants";
import {
  loadNanumGothicFont,
  type FontkitFont,
} from "../../src/technical/pdf/fontLoader";
import { generateBoardPdf } from "../../src/technical/pdf/pdfGenerator";
import {
  buildDocumentRenderPlan,
  type EmployeeCardInput,
} from "../../src/technical/pdf/renderPlan";

describe("TRD §10 & S00.04 PDF Generation Engine", () => {
  let font: FontkitFont;
  let fontBytes: Uint8Array;
  let samplePngBytes: Uint8Array;

  beforeAll(async () => {
    const fontRes = await loadNanumGothicFont();
    font = fontRes.font;
    fontBytes = fontRes.fontBytes;

    const sampleImagePath = path.resolve(
      process.cwd(),
      "tests",
      "fixtures",
      "images",
      "synthetic-portrait.png",
    );
    samplePngBytes = new Uint8Array(fs.readFileSync(sampleImagePath));
  });

  const photoProvider = async () => samplePngBytes;

  const makeEmployees = (count: number): EmployeeCardInput[] =>
    Array.from({ length: count }, (_, i) => ({
      employeeId: `emp-${i + 1}`,
      name: i === 0 ? "홍길동" : i === 15 ? "김철수 수석" : `직원${i + 1}`,
      jobCategory: "개발",
      contractType: i % 2 === 0 ? "정규직" : "계약직",
      photoCrop: { x: 0, y: 0, width: 224, height: 263 },
    }));

  it("generates a 1-card PDF with 1 page and A4 landscape dimensions", async () => {
    const docPlan = buildDocumentRenderPlan(makeEmployees(1), font);
    const pdfBytes = await generateBoardPdf(docPlan, fontBytes, photoProvider);

    expect(pdfBytes.byteLength).toBeGreaterThan(1000);

    const parsed = await PDFDocument.load(pdfBytes);
    expect(parsed.getPageCount()).toBe(1);

    const page1 = parsed.getPage(0);
    const size = page1.getSize();
    expect(size.width).toBeCloseTo(PAGE_CONSTANTS.WIDTH_PT, 1);
    expect(size.height).toBeCloseTo(PAGE_CONSTANTS.HEIGHT_PT, 1);
  });

  it("generates a 21-card PDF on exactly 1 page", async () => {
    const docPlan = buildDocumentRenderPlan(makeEmployees(21), font);
    const pdfBytes = await generateBoardPdf(docPlan, fontBytes, photoProvider);

    const parsed = await PDFDocument.load(pdfBytes);
    expect(parsed.getPageCount()).toBe(1);
  });

  it("generates a 22-card PDF across exactly 2 pages with calibration marks", async () => {
    const docPlan = buildDocumentRenderPlan(makeEmployees(22), font);
    const pdfBytes = await generateBoardPdf(docPlan, fontBytes, photoProvider, {
      includeCalibrationMarks: true,
    });

    const parsed = await PDFDocument.load(pdfBytes);
    expect(parsed.getPageCount()).toBe(2);

    const page1 = parsed.getPage(0);
    const page2 = parsed.getPage(1);
    expect(page1.getSize().width).toBeCloseTo(PAGE_CONSTANTS.WIDTH_PT, 1);
    expect(page2.getSize().width).toBeCloseTo(PAGE_CONSTANTS.WIDTH_PT, 1);
  });

  it("throws when trying to generate PDF for 0 employees", async () => {
    const docPlan = buildDocumentRenderPlan([], font);
    await expect(generateBoardPdf(docPlan, fontBytes, photoProvider)).rejects.toThrow(
      "차단",
    );
  });

  it("throws when trying to generate PDF with blocking issues (e.g. missing glyph)", async () => {
    const badEmployees: EmployeeCardInput[] = [
      {
        employeeId: "bad-1",
        name: "홍길동 😊",
        jobCategory: "디자인",
        contractType: "정규직",
        photoCrop: { x: 0, y: 0, width: 224, height: 263 },
      },
    ];
    const docPlan = buildDocumentRenderPlan(badEmployees, font);
    await expect(generateBoardPdf(docPlan, fontBytes, photoProvider)).rejects.toThrow(
      "글꼴에 지원되지 않는 문자",
    );
  });
});
