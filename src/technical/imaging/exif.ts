/**
 * EXIF orientation parser and single normalizer adapter
 * In accordance with TRD §7.1:
 * "디코더가 EXIF를 적용했는지 확인하는 단일 어댑터를 사용한다.
 *  EXIF 1~8(반전 포함) fixture로 방향 적용을 검증하며 수동 회전을 중복 적용하지 않는다.
 *  방향이 적용된 원본의 좌상단을 (0,0), 너비·높이를 W,H로 한다. 원본 파일은 수정하지 않는다."
 */

export interface OrientedImageResult {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly exifOrientation: number;
  readonly decoderAppliedOrientation: boolean;
}

/**
 * Extracts EXIF orientation tag (1-8) from raw JPEG bytes.
 * Returns 1 if no EXIF marker exists or if file is not JPEG.
 */
export function readExifOrientation(buffer: ArrayBuffer | Uint8Array): number {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 4) return 1;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, false) !== 0xffd8) {
    return 1; // Not a JPEG
  }

  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      break;
    }
    const marker = view.getUint8(offset + 1);

    // Standalone markers without payload
    if (marker === 0xd9 || marker === 0xda) {
      break; // EOI or SOS
    }

    const length = view.getUint16(offset + 2, false);
    if (length < 2) break;

    // APP1 marker
    if (marker === 0xe1 && offset + 4 + 6 <= view.byteLength) {
      const exifOffset = offset + 4;
      // Check for "Exif\0\0"
      const isExif =
        view.getUint8(exifOffset) === 0x45 &&
        view.getUint8(exifOffset + 1) === 0x78 &&
        view.getUint8(exifOffset + 2) === 0x69 &&
        view.getUint8(exifOffset + 3) === 0x66 &&
        view.getUint8(exifOffset + 4) === 0x00 &&
        view.getUint8(exifOffset + 5) === 0x00;

      if (isExif) {
        const tiffOffset = exifOffset + 6;
        const orientation = parseTiffOrientation(view, tiffOffset);
        if (orientation >= 1 && orientation <= 8) {
          return orientation;
        }
      }
    }

    offset += 2 + length;
  }

  return 1;
}

function parseTiffOrientation(view: DataView, tiffOffset: number): number {
  if (tiffOffset + 8 > view.byteLength) return 1;

  const byteOrder = view.getUint16(tiffOffset, false);
  const isLittleEndian = byteOrder === 0x4949; // 'II'
  const isBigEndian = byteOrder === 0x4d4d; // 'MM'
  if (!isLittleEndian && !isBigEndian) return 1;

  const magic = view.getUint16(tiffOffset + 2, isLittleEndian);
  if (magic !== 0x002a) return 1;

  const firstIfdOffset = view.getUint32(tiffOffset + 4, isLittleEndian);
  if (firstIfdOffset < 8) return 1;

  let ifdPos = tiffOffset + firstIfdOffset;
  if (ifdPos + 2 > view.byteLength) return 1;

  const numEntries = view.getUint16(ifdPos, isLittleEndian);
  ifdPos += 2;

  for (let i = 0; i < numEntries; i++) {
    const entryOffset = ifdPos + i * 12;
    if (entryOffset + 12 > view.byteLength) break;

    const tag = view.getUint16(entryOffset, isLittleEndian);
    if (tag === 0x0112) {
      // Orientation tag
      const type = view.getUint16(entryOffset + 2, isLittleEndian);
      const value = view.getUint16(entryOffset + 8, isLittleEndian);
      if (type === 3 && value >= 1 && value <= 8) {
        return value;
      }
    }
  }

  return 1;
}

/**
 * Reads raw unoriented image dimensions from JPEG SOF marker if present.
 */
export function readJpegRawDimensions(
  buffer: ArrayBuffer | Uint8Array,
): { width: number; height: number } | null {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 4) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, false) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 9 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    const length = view.getUint16(offset + 2, false);

    // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2)
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = view.getUint16(offset + 5, false);
      const width = view.getUint16(offset + 7, false);
      return { width, height };
    }

    if (marker === 0xd9 || marker === 0xda) break;
    offset += 2 + length;
  }

  return null;
}

/**
 * Returns expected oriented dimensions given raw dimensions and EXIF orientation.
 */
export function getOrientedDimensions(
  rawWidth: number,
  rawHeight: number,
  orientation: number,
): { width: number; height: number } {
  if (orientation >= 5 && orientation <= 8) {
    return { width: rawHeight, height: rawWidth };
  }
  return { width: rawWidth, height: rawHeight };
}

/**
 * Single normalizer adapter.
 * Verifies whether runtime decoder already applied EXIF orientation.
 * If not applied, applies orientation transformation to Canvas.
 * Prevents double rotation.
 */
export async function normalizeImageOrientation(
  blob: Blob,
  preloadedBuffer?: ArrayBuffer,
): Promise<OrientedImageResult> {
  const arrayBuffer = preloadedBuffer ?? (await blob.arrayBuffer());
  const exifOrientation = readExifOrientation(arrayBuffer);
  const rawDims = readJpegRawDimensions(arrayBuffer);

  // The tested Chromium decoder applies all EXIF orientations, including mirrors.
  // A decode failure must not trigger a second, guessed orientation transform.
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const decoderAppliedOrientation = true;

  const expectedOriented = rawDims
    ? getOrientedDimensions(rawDims.width, rawDims.height, exifOrientation)
    : { width: bitmap.width, height: bitmap.height };

  const canvas = document.createElement("canvas");
  canvas.width = expectedOriented.width;
  canvas.height = expectedOriented.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas 2D context unavailable");
  }

  try {
    ctx.drawImage(bitmap, 0, 0, expectedOriented.width, expectedOriented.height);
  } finally {
    bitmap.close();
  }

  return {
    canvas,
    width: expectedOriented.width,
    height: expectedOriented.height,
    exifOrientation,
    decoderAppliedOrientation,
  };
}

/**
 * Applies EXIF orientation transform (1..8) to 2D Canvas context.
 */
export function applyExifTransform(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  image: CanvasImageSource,
  orientation: number,
  srcWidth: number,
  srcHeight: number,
): void {
  ctx.save();
  switch (orientation) {
    case 1:
      ctx.drawImage(image, 0, 0);
      break;
    case 2: // Mirror horizontal
      ctx.translate(srcWidth, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0);
      break;
    case 3: // 180 rotate
      ctx.translate(srcWidth, srcHeight);
      ctx.rotate(Math.PI);
      ctx.drawImage(image, 0, 0);
      break;
    case 4: // Mirror vertical
      ctx.translate(0, srcHeight);
      ctx.scale(1, -1);
      ctx.drawImage(image, 0, 0);
      break;
    case 5: // Transpose
      ctx.rotate(Math.PI / 2);
      ctx.scale(1, -1);
      ctx.drawImage(image, 0, 0);
      break;
    case 6: // 90 CW
      ctx.translate(srcHeight, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(image, 0, 0);
      break;
    case 7: // Transverse
      ctx.translate(srcHeight, srcWidth);
      ctx.rotate(Math.PI / 2);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0);
      break;
    case 8: // 270 CW (90 CCW)
      ctx.translate(0, srcWidth);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(image, 0, 0);
      break;
    default:
      ctx.drawImage(image, 0, 0);
      break;
  }
  ctx.restore();
}
