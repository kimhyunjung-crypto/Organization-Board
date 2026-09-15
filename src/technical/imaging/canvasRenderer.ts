import type { CropRect, FaceDetectionData } from "./types";

export interface RenderCardPhotoOptions {
  readonly targetWidth?: number; // default 265
  readonly targetHeight?: number; // default 311
  readonly showGuides?: boolean;
}

/**
 * Renders the cropped photo region onto the destination card Canvas.
 * Matches TRD §9.1 and §9.4 (22.4 x 26.3mm -> 265 x 311px at 300ppi).
 */
export function renderCardPhoto(
  source: CanvasImageSource,
  crop: CropRect,
  targetCanvas: HTMLCanvasElement,
  options: RenderCardPhotoOptions = {},
): void {
  const { targetWidth = 265, targetHeight = 311, showGuides = false } = options;

  targetCanvas.width = targetWidth;
  targetCanvas.height = targetHeight;

  const ctx = targetCanvas.getContext("2d");
  if (!ctx) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Clear
  ctx.clearRect(0, 0, targetWidth, targetHeight);

  // Draw the cropped portion from source to target
  ctx.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  if (showGuides) {
    // 38% Eye height guideline (TRD §7.2)
    const eyeY = targetHeight * 0.38;
    ctx.save();
    ctx.strokeStyle = "rgba(0, 200, 255, 0.7)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, eyeY);
    ctx.lineTo(targetWidth, eyeY);
    ctx.stroke();

    // 55% Face height guideline box (TRD §7.2)
    const faceH = targetHeight * 0.55;
    const faceW = faceH; // approximately square head region
    const faceX = (targetWidth - faceW) / 2;
    const faceY = eyeY - faceH * 0.35;
    ctx.strokeStyle = "rgba(255, 180, 0, 0.6)";
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(faceX, faceY, faceW, faceH);

    ctx.restore();
  }
}

/**
 * Renders the full editor canvas with the image, crop window overlay, and landmark dots.
 */
export function renderEditorView(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  crop: CropRect,
  faces: readonly FaceDetectionData[],
  targetCanvas: HTMLCanvasElement,
  displayScale: number = 1.0,
): void {
  const targetW = Math.round(sourceWidth * displayScale);
  const targetH = Math.round(sourceHeight * displayScale);

  targetCanvas.width = targetW;
  targetCanvas.height = targetH;

  const ctx = targetCanvas.getContext("2d");
  if (!ctx) return;

  // Draw full image
  ctx.drawImage(source, 0, 0, targetW, targetH);

  // Dim the uncropped area
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, targetW, targetH);

  // Cut out the crop area
  const cx = crop.x * displayScale;
  const cy = crop.y * displayScale;
  const cw = crop.width * displayScale;
  const ch = crop.height * displayScale;

  ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, cx, cy, cw, ch);

  // Draw crop boundary
  ctx.strokeStyle = "#0196FF";
  ctx.lineWidth = 2;
  ctx.strokeRect(cx, cy, cw, ch);

  // Draw corner markers
  const markerLen = 12;
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 3;

  // Top-left
  ctx.beginPath();
  ctx.moveTo(cx, cy + markerLen);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx + markerLen, cy);
  ctx.stroke();

  // Top-right
  ctx.beginPath();
  ctx.moveTo(cx + cw - markerLen, cy);
  ctx.lineTo(cx + cw, cy);
  ctx.lineTo(cx + cw, cy + markerLen);
  ctx.stroke();

  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(cx, cy + ch - markerLen);
  ctx.lineTo(cx, cy + ch);
  ctx.lineTo(cx + markerLen, cy + ch);
  ctx.stroke();

  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(cx + cw - markerLen, cy + ch);
  ctx.lineTo(cx + cw, cy + ch);
  ctx.lineTo(cx + cw, cy + ch - markerLen);
  ctx.stroke();

  // Draw detected face bounding boxes and keypoints
  for (const face of faces) {
    const fx = face.boundingBox.x * displayScale;
    const fy = face.boundingBox.y * displayScale;
    const fw = face.boundingBox.width * displayScale;
    const fh = face.boundingBox.height * displayScale;

    ctx.strokeStyle = "rgba(71, 181, 11, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 2]);
    ctx.strokeRect(fx, fy, fw, fh);

    // Keypoints
    for (const kp of face.keypoints) {
      ctx.fillStyle = "rgba(255, 1, 162, 0.9)";
      ctx.beginPath();
      ctx.arc(kp.originalX * displayScale, kp.originalY * displayScale, 3, 0, 2 * Math.PI);
      ctx.fill();
    }

    if (face.eyeCenter) {
      ctx.fillStyle = "#0196FF";
      ctx.beginPath();
      ctx.arc(
        face.eyeCenter.originalX * displayScale,
        face.eyeCenter.originalY * displayScale,
        4,
        0,
        2 * Math.PI,
      );
      ctx.fill();
    }
  }

  ctx.restore();
}
