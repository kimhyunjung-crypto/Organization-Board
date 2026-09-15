import { PDFDocument, rgb } from "pdf-lib";
import {
  CARD_CONSTANTS,
  PAGE_CONSTANTS,
  mmToPt,
} from "./constants";
import { fontkitInstance } from "./fontLoader";
import type { CardRenderPlan, DocumentRenderPlan, PhotoProvider } from "./types";

export interface GenerateBoardPdfOptions {
  readonly includeCalibrationMarks?: boolean;
}

/**
 * Generates the organization board PDF in accordance with TRD §9 and §10.
 *
 * Requirements:
 * - A4 landscape (297 × 210 mm)
 * - 7 × 3 = 21 cards per page, fixed origin (54.4, 47.0 mm), steps (27.2, 39.0 mm)
 * - Card 25 × 38 mm, 0.6pt outline with inset half-stroke (0.3pt)
 * - Photo 22.4 × 26.3 mm raster image
 * - Chip 22.4 × 2.9 mm vector rectangle
 * - Name vector text with embedded NanumGothicExtraBold
 * - Empty slots on last page are NOT drawn
 * - 0 employees is blocked
 */
export async function generateBoardPdf(
  documentPlan: DocumentRenderPlan,
  fontBytes: Uint8Array,
  photoProvider: PhotoProvider,
  options: GenerateBoardPdfOptions = {},
): Promise<Uint8Array> {
  if (documentPlan.isBlocked) {
    throw new Error(
      `PDF 생성이 차단되었습니다:\n${documentPlan.blockingIssues.join("\n")}`,
    );
  }

  if (documentPlan.totalEmployees === 0 || documentPlan.totalPages === 0) {
    throw new Error("출력할 직원이 0명입니다. 최소 1명 이상이어야 합니다.");
  }

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkitInstance);
  const embeddedFont = await pdfDoc.embedFont(fontBytes);

  const { includeCalibrationMarks = false } = options;
  const imageCache = new Map<Uint8Array, import("pdf-lib").PDFImage>();

  for (let pageIdx = 0; pageIdx < documentPlan.totalPages; pageIdx++) {
    const page = pdfDoc.addPage([
      PAGE_CONSTANTS.WIDTH_PT,
      PAGE_CONSTANTS.HEIGHT_PT,
    ]);

    const pageCards = documentPlan.cards.filter(
      (c) => c.pagePosition.pageIndex === pageIdx,
    );

    for (const card of pageCards) {
      await renderCardOnPdfPage(page, pdfDoc, card, embeddedFont, photoProvider, imageCache);
    }

    if (includeCalibrationMarks) {
      drawCalibrationMarks(page, embeddedFont);
    }
  }

  return await pdfDoc.save();
}

async function renderCardOnPdfPage(
  page: import("pdf-lib").PDFPage,
  pdfDoc: PDFDocument,
  card: CardRenderPlan,
  font: import("pdf-lib").PDFFont,
  photoProvider: PhotoProvider,
  imageCache: Map<Uint8Array, import("pdf-lib").PDFImage>,
): Promise<void> {
  const cardX_mm = card.pagePosition.xMm;
  const cardY_mm = card.pagePosition.yMm;

  // 1. Draw Photo (Raster image, 22.4 × 26.3 mm at 1.3, 1.0 mm)
  const photoX_mm = cardX_mm + CARD_CONSTANTS.PHOTO.X_MM;
  const photoY_mm = cardY_mm + CARD_CONSTANTS.PHOTO.Y_MM;
  const photoW_pt = mmToPt(CARD_CONSTANTS.PHOTO.WIDTH_MM);
  const photoH_pt = mmToPt(CARD_CONSTANTS.PHOTO.HEIGHT_MM);
  const photoPdfX = mmToPt(photoX_mm);
  // In PDF, Y starts at bottom
  const photoPdfY = mmToPt(PAGE_CONSTANTS.HEIGHT_MM - (photoY_mm + CARD_CONSTANTS.PHOTO.HEIGHT_MM));

  const imageBytes = await photoProvider(card);
  let embeddedImage = imageCache.get(imageBytes);
  if (!embeddedImage) {
    const isPng =
      imageBytes[0] === 0x89 &&
      imageBytes[1] === 0x50 &&
      imageBytes[2] === 0x4e &&
      imageBytes[3] === 0x47;

    embeddedImage = isPng
      ? await pdfDoc.embedPng(imageBytes)
      : await pdfDoc.embedJpg(imageBytes);
    imageCache.set(imageBytes, embeddedImage);
  }

  page.drawImage(embeddedImage, {
    x: photoPdfX,
    y: photoPdfY,
    width: photoW_pt,
    height: photoH_pt,
  });

  // 2. Draw Color Chip (Vector rect, 22.4 × 2.9 mm at 1.3, 27.3 mm)
  const chipX_mm = cardX_mm + CARD_CONSTANTS.CHIP.X_MM;
  const chipY_mm = cardY_mm + CARD_CONSTANTS.CHIP.Y_MM;
  const chipW_pt = mmToPt(CARD_CONSTANTS.CHIP.WIDTH_MM);
  const chipH_pt = mmToPt(CARD_CONSTANTS.CHIP.HEIGHT_MM);
  const chipPdfX = mmToPt(chipX_mm);
  const chipPdfY = mmToPt(PAGE_CONSTANTS.HEIGHT_MM - (chipY_mm + CARD_CONSTANTS.CHIP.HEIGHT_MM));

  page.drawRectangle({
    x: chipPdfX,
    y: chipPdfY,
    width: chipW_pt,
    height: chipH_pt,
    color: rgb(card.chipColorRgb.r, card.chipColorRgb.g, card.chipColorRgb.b),
  });

  // 3. Draw Name (Vector text, embedded font)
  if (card.nameLayout.fits && card.nameLayout.lineMetrics.length > 0) {
    for (const line of card.nameLayout.lineMetrics) {
      const linePdfX = mmToPt(cardX_mm) + line.xPt;
      // line.baselineYPt is measured from card top
      const linePdfY = mmToPt(PAGE_CONSTANTS.HEIGHT_MM - cardY_mm) - line.baselineYPt;

      page.drawText(line.text, {
        x: linePdfX,
        y: linePdfY,
        font,
        size: card.nameLayout.fontSize,
        color: rgb(0, 0, 0),
      });
    }
  }

  // 4. Draw Outline (Vector stroked rect, 0.6pt, inset 0.3pt so outside is exactly 25 × 38 mm)
  const outlineWidth = CARD_CONSTANTS.OUTLINE_WIDTH_PT; // 0.6 pt
  const outlineInset = CARD_CONSTANTS.OUTLINE_INSET_PT; // 0.3 pt
  const cardW_pt = mmToPt(CARD_CONSTANTS.WIDTH_MM);
  const cardH_pt = mmToPt(CARD_CONSTANTS.HEIGHT_MM);

  const rectX = mmToPt(cardX_mm) + outlineInset;
  const rectY = mmToPt(PAGE_CONSTANTS.HEIGHT_MM - (cardY_mm + CARD_CONSTANTS.HEIGHT_MM)) + outlineInset;
  const rectW = cardW_pt - outlineWidth;
  const rectH = cardH_pt - outlineWidth;

  page.drawRectangle({
    x: rectX,
    y: rectY,
    width: rectW,
    height: rectH,
    borderWidth: outlineWidth,
    borderColor: rgb(
      CARD_CONSTANTS.OUTLINE_COLOR_RGB.r,
      CARD_CONSTANTS.OUTLINE_COLOR_RGB.g,
      CARD_CONSTANTS.OUTLINE_COLOR_RGB.b,
    ),
  });
}

function drawCalibrationMarks(
  page: import("pdf-lib").PDFPage,
  font: import("pdf-lib").PDFFont,
): void {
  // Horizontal Ruler (100 mm) at bottom margin away from cards (y = 185 mm)
  // Cards end at y = 47.0 + 116.0 = 163.0 mm.
  const hRulerX_mm = 54.4;
  const hRulerY_mm = 185.0;
  const hRulerLen_mm = 100.0;

  const hPdfX = mmToPt(hRulerX_mm);
  const hPdfY = mmToPt(PAGE_CONSTANTS.HEIGHT_MM - hRulerY_mm);
  const hPdfLen = mmToPt(hRulerLen_mm);

  // Baseline line
  page.drawLine({
    start: { x: hPdfX, y: hPdfY },
    end: { x: hPdfX + hPdfLen, y: hPdfY },
    thickness: 0.5,
    color: rgb(0.2, 0.2, 0.2),
  });

  // Ticks for horizontal ruler
  for (let m = 0; m <= 100; m++) {
    const tx = hPdfX + mmToPt(m);
    const tickLen = m % 10 === 0 ? 4 : m % 5 === 0 ? 2.5 : 1.2;
    page.drawLine({
      start: { x: tx, y: hPdfY },
      end: { x: tx, y: hPdfY + mmToPt(tickLen) },
      thickness: m % 10 === 0 ? 0.6 : 0.3,
      color: rgb(0.2, 0.2, 0.2),
    });

    if (m % 10 === 0) {
      const label = m === 100 ? "100 mm" : `${m}`;
      page.drawText(label, {
        x: tx - (m === 100 ? 12 : 3),
        y: hPdfY - 8,
        font,
        size: 6,
        color: rgb(0.2, 0.2, 0.2),
      });
    }
  }

  // Ruler Title
  page.drawText("100 mm 가로 기준 눈금 (인쇄 후 자로 실측하여 100% 배율 일치 확인)", {
    x: hPdfX,
    y: hPdfY + mmToPt(5.5),
    font,
    size: 7.5,
    color: rgb(0.1, 0.1, 0.1),
  });

  // Vertical Ruler (100 mm) at right margin away from cards (x = 265 mm)
  // Cards end at x = 54.4 + 188.2 = 242.6 mm.
  const vRulerX_mm = 265.0;
  const vRulerY_mm = 47.0;
  const vRulerLen_mm = 100.0;

  const vPdfX = mmToPt(vRulerX_mm);
  const vPdfY_top = mmToPt(PAGE_CONSTANTS.HEIGHT_MM - vRulerY_mm);
  const vPdfLen = mmToPt(vRulerLen_mm);

  // Baseline line
  page.drawLine({
    start: { x: vPdfX, y: vPdfY_top },
    end: { x: vPdfX, y: vPdfY_top - vPdfLen },
    thickness: 0.5,
    color: rgb(0.2, 0.2, 0.2),
  });

  // Ticks for vertical ruler
  for (let m = 0; m <= 100; m++) {
    const ty = vPdfY_top - mmToPt(m);
    const tickLen = m % 10 === 0 ? 4 : m % 5 === 0 ? 2.5 : 1.2;
    page.drawLine({
      start: { x: vPdfX, y: ty },
      end: { x: vPdfX + mmToPt(tickLen), y: ty },
      thickness: m % 10 === 0 ? 0.6 : 0.3,
      color: rgb(0.2, 0.2, 0.2),
    });

    if (m % 10 === 0) {
      const label = m === 100 ? "100 mm" : `${m}`;
      page.drawText(label, {
        x: vPdfX + mmToPt(tickLen) + 3,
        y: ty - 2.5,
        font,
        size: 6,
        color: rgb(0.2, 0.2, 0.2),
      });
    }
  }

  // Vertical ruler title
  page.drawText("100 mm 세로 기준 눈금", {
    x: vPdfX - 10,
    y: vPdfY_top + 10,
    font,
    size: 7.5,
    color: rgb(0.1, 0.1, 0.1),
  });

  // Calibration and Print Instructions Box
  const instX = mmToPt(165);
  const instY = hPdfY + mmToPt(7);

  page.drawText(
    "■ 실제 크기(100%)로 인쇄 / '용지에 맞춤' 및 '축소' 해제 (Do NOT fit/shrink)",
    {
      x: instX,
      y: instY,
      font,
      size: 8,
      color: rgb(0.8, 0.1, 0.1),
    },
  );

  page.drawText(
    "■ 카드 규격: 25 × 38 mm (허용 오차 ±0.5 mm) / A4 가로 (297 × 210 mm) 고정",
    {
      x: instX,
      y: instY - 11,
      font,
      size: 7.5,
      color: rgb(0.2, 0.2, 0.2),
    },
  );

  page.drawText(
    "■ 주의: 85% 등 임의 축소 인쇄 금지 / 인쇄 후 눈금자와 카드를 실측하여 치수를 확인하세요.",
    {
      x: instX,
      y: instY - 21,
      font,
      size: 7,
      color: rgb(0.35, 0.35, 0.35),
    },
  );
}
