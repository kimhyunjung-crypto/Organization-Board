import fontkit from "@pdf-lib/fontkit";
import { FaceDetector } from "@mediapipe/tasks-vision";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import Cropper from "react-easy-crop";
import { describe, expect, it } from "vitest";

describe("technical-spike dependencies", () => {
  it("loads the selected browser libraries from pinned packages", () => {
    expect(ExcelJS.Workbook).toBeTypeOf("function");
    expect(FaceDetector.createFromOptions).toBeTypeOf("function");
    expect(PDFDocument.create).toBeTypeOf("function");
    expect(fontkit.create).toBeTypeOf("function");
    expect(Cropper).toBeTypeOf("function");
  });
});
