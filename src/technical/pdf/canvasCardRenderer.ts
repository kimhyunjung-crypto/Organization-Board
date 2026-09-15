import { CARD_CONSTANTS, FONT_CONSTANTS, PT_PER_MM } from "./constants";
import type { CardRenderPlan } from "./types";

export interface RenderCardToCanvasOptions {
  readonly scale?: number; // pixels per mm (default: 300 / 25.4 ≈ 11.811 for 300 ppi)
  readonly targetWidth?: number; // overrides scale to fit targetWidth px
  readonly showGuides?: boolean;
  readonly photoSource?: CanvasImageSource | null;
}

/**
 * Renders a card onto an HTMLCanvasElement using the exact CardRenderPlan.
 * This ensures that Canvas card preview matches the PDF layout down to sub-pixel coordinates.
 */
export function renderCardToCanvas(
  plan: CardRenderPlan,
  targetCanvas: HTMLCanvasElement,
  options: RenderCardToCanvasOptions = {},
): void {
  const {
    targetWidth,
    scale: customScale,
    showGuides = false,
    photoSource = null,
  } = options;

  const defaultPpiScale = 300 / 25.4; // ≈ 11.811 px / mm (295 × 449 px)
  const scale = targetWidth !== undefined
    ? targetWidth / CARD_CONSTANTS.WIDTH_MM
    : (customScale ?? defaultPpiScale);

  const canvasWidth = Math.round(CARD_CONSTANTS.WIDTH_MM * scale);
  const canvasHeight = Math.round(CARD_CONSTANTS.HEIGHT_MM * scale);

  targetCanvas.width = canvasWidth;
  targetCanvas.height = canvasHeight;

  const ctx = targetCanvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // 1. Draw Card Background
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Conversion ratio from pt to canvas px
  const pxPerPt = scale / PT_PER_MM;

  // 2. Draw Photo
  const px = CARD_CONSTANTS.PHOTO.X_MM * scale;
  const py = CARD_CONSTANTS.PHOTO.Y_MM * scale;
  const pw = CARD_CONSTANTS.PHOTO.WIDTH_MM * scale;
  const ph = CARD_CONSTANTS.PHOTO.HEIGHT_MM * scale;

  if (photoSource) {
    const crop = plan.photoCrop;
    ctx.drawImage(
      photoSource,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      px,
      py,
      pw,
      ph,
    );
  } else {
    // Placeholder if no photo
    ctx.fillStyle = "#E8E8E8";
    ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = "#888888";
    ctx.font = `${Math.round(10 * pxPerPt)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("사진", px + pw / 2, py + ph / 2);
  }

  // 3. Draw Color Chip (Vector rect)
  const cx = CARD_CONSTANTS.CHIP.X_MM * scale;
  const cy = CARD_CONSTANTS.CHIP.Y_MM * scale;
  const cw = CARD_CONSTANTS.CHIP.WIDTH_MM * scale;
  const ch = CARD_CONSTANTS.CHIP.HEIGHT_MM * scale;

  ctx.fillStyle = plan.chipColorHex;
  ctx.fillRect(cx, cy, cw, ch);

  // 4. Draw Name (Vector text with embedded font metrics)
  if (plan.nameLayout.fits && plan.nameLayout.lineMetrics.length > 0) {
    const fontSizePx = plan.nameLayout.fontSize * pxPerPt;
    ctx.font = `800 ${fontSizePx}px "${FONT_CONSTANTS.FAMILY_NAME}", "Nanum Gothic", sans-serif`;
    ctx.fillStyle = "#000000";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    for (const line of plan.nameLayout.lineMetrics) {
      const lineXPx = line.xPt * pxPerPt;
      const lineYPx = line.baselineYPt * pxPerPt;
      ctx.fillText(line.text, lineXPx, lineYPx);
    }
  } else if (!plan.nameLayout.fits) {
    // Render overflow / error warning
    ctx.fillStyle = "#D32F2F";
    ctx.font = `bold ${Math.round(8 * pxPerPt)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const ny = CARD_CONSTANTS.NAME_USABLE.Y_MM * scale;
    const nh = CARD_CONSTANTS.NAME_USABLE.HEIGHT_MM * scale;
    ctx.fillText(plan.nameLayout.error ?? "ERROR", px + pw / 2, ny + nh / 2);
  }

  // 5. Draw Card Outline (0.6pt stroke, inset half-stroke = 0.3pt)
  const strokeWidthPx = CARD_CONSTANTS.OUTLINE_WIDTH_PT * pxPerPt;
  const insetPx = strokeWidthPx / 2;

  ctx.save();
  ctx.strokeStyle = CARD_CONSTANTS.OUTLINE_COLOR_HEX;
  ctx.lineWidth = strokeWidthPx;
  ctx.strokeRect(
    insetPx,
    insetPx,
    canvasWidth - 2 * insetPx,
    canvasHeight - 2 * insetPx,
  );
  ctx.restore();

  // 6. Optional Guides
  if (showGuides) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    // Usable name area box
    const ux = CARD_CONSTANTS.NAME_USABLE.X_MM * scale;
    const uy = CARD_CONSTANTS.NAME_USABLE.Y_MM * scale;
    const uw = CARD_CONSTANTS.NAME_USABLE.WIDTH_MM * scale;
    const uh = CARD_CONSTANTS.NAME_USABLE.HEIGHT_MM * scale;

    ctx.strokeStyle = "rgba(0, 150, 255, 0.6)";
    ctx.strokeRect(ux, uy, uw, uh);

    ctx.restore();
  }
}
