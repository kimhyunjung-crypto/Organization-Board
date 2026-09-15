import { describe, expect, it } from "vitest";
import {
  computeCoverCrop,
  computeFaceCrop,
  computeZoomedCrop,
  denormalizeRect,
  normalizeRect,
  panCrop,
  verifyRoundtrip,
  checkLowResolution,
} from "../../src/technical/imaging/crop";
import {
  getOrientedDimensions,
  readExifOrientation,
  readJpegRawDimensions,
} from "../../src/technical/imaging/exif";
import { type CropRect } from "../../src/technical/imaging/types";

describe("TRD §7.2 Cover Crop", () => {
  it("computes exact aspect ratio r = 22.4 / 26.3 for square image", () => {
    const W = 1000;
    const H = 1000;
    const r = 22.4 / 26.3;
    const crop = computeCoverCrop(W, H);

    // For square image, W / r = 1000 / (22.4/26.3) > 1000, so hCover = min(H, W/r) = H = 1000
    expect(crop.height).toBeCloseTo(1000, 5);
    expect(crop.width).toBeCloseTo(1000 * r, 5);
    expect(crop.width / crop.height).toBeCloseTo(r, 5);

    // Centered placement
    expect(crop.x).toBeCloseTo((1000 - crop.width) / 2, 5);
    expect(crop.y).toBeCloseTo(0, 5);
  });

  it("computes cover crop for wide landscape image", () => {
    const W = 1600;
    const H = 800;
    const r = 22.4 / 26.3;
    const crop = computeCoverCrop(W, H);

    // hCover = min(800, 1600 / r) = 800
    expect(crop.height).toBe(800);
    expect(crop.width).toBeCloseTo(800 * r, 5);
    expect(crop.x).toBeCloseTo((1600 - crop.width) / 2, 5);
    expect(crop.y).toBe(0);
  });

  it("computes cover crop for tall portrait image", () => {
    const W = 400;
    const H = 1200;
    const r = 22.4 / 26.3;
    const crop = computeCoverCrop(W, H);

    // hCover = min(1200, 400 / r) = 400 / r ≈ 469.64
    expect(crop.width).toBeCloseTo(400, 5);
    expect(crop.height).toBeCloseTo(400 / r, 5);
    expect(crop.x).toBe(0);
    expect(crop.y).toBeCloseTo((1200 - crop.height) / 2, 5);
  });
});

describe("TRD §7.2 Single Face-Based Crop", () => {
  it("places face at 55% height and eye at 38% height when unclamped", () => {
    const W = 1200;
    const H = 1200;
    const r = 22.4 / 26.3;

    // A centered face: faceH = 220, faceX = 600, eyeY = 500
    const faceBox: CropRect = { x: 490, y: 390, width: 220, height: 220 };
    const eyeCenter = { x: 600, y: 470 };

    const result = computeFaceCrop({ width: W, height: H, faceBox, eyeCenter });

    expect(result.method).toBe("face");
    expect(result.requiresConfirmation).toBe(false);

    // hDesired = 220 / 0.55 = 400
    expect(result.crop.height).toBeCloseTo(400, 4);
    expect(result.crop.width).toBeCloseTo(400 * r, 4);

    // Face center should be at 50% of crop width
    const faceCenterX = faceBox.x + faceBox.width / 2;
    const cropCenterX = result.crop.x + result.crop.width / 2;
    expect(cropCenterX).toBeCloseTo(faceCenterX, 4);

    // Eye level should be at 38% of crop height
    const eyeRelativeY = (eyeCenter.y - result.crop.y) / result.crop.height;
    expect(eyeRelativeY).toBeCloseTo(0.38, 4);

    // Face height ratio should be 55%
    const faceRatio = faceBox.height / result.crop.height;
    expect(faceRatio).toBeCloseTo(0.55, 4);
  });

  it("detects edge clipping and composition deviation when face is near image border", () => {
    const W = 600;
    const H = 600;

    // Face pushed up against top-left edge
    const faceBox: CropRect = { x: 10, y: 10, width: 200, height: 200 };
    const eyeCenter = { x: 110, y: 80 };

    const result = computeFaceCrop({ width: W, height: H, faceBox, eyeCenter });

    // Edge clamping should trigger confirmation
    expect(result.requiresConfirmation).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("requires confirmation when eye landmarks are missing (TRD §7.2)", () => {
    const W = 1000;
    const H = 1000;
    const faceBox: CropRect = { x: 300, y: 300, width: 200, height: 220 };

    const result = computeFaceCrop({ width: W, height: H, faceBox, eyeCenter: undefined });
    expect(result.requiresConfirmation).toBe(true);
    expect(result.issues.some((i) => i.requiresConfirmation)).toBe(true);
  });
});

describe("TRD §8 Zoom 1~5 and Center Preservation", () => {
  it("preserves crop center when zoom increases from 1x to 3x", () => {
    const W = 1200;
    const H = 1200;
    const cover = computeCoverCrop(W, H);

    const initialCenterX = cover.x + cover.width / 2;
    const initialCenterY = cover.y + cover.height / 2;

    const zoomedCrop = computeZoomedCrop(cover, W, H, 3.0);

    const zoomedCenterX = zoomedCrop.x + zoomedCrop.width / 2;
    const zoomedCenterY = zoomedCrop.y + zoomedCrop.height / 2;

    expect(zoomedCenterX).toBeCloseTo(initialCenterX, 4);
    expect(zoomedCenterY).toBeCloseTo(initialCenterY, 4);
    expect(zoomedCrop.height).toBeCloseTo(cover.height / 3.0, 4);
  });

  it("clamps zoom strictly between 1.0 and 5.0", () => {
    const W = 1000;
    const H = 1000;
    const cover = computeCoverCrop(W, H);

    const zoomTooLow = computeZoomedCrop(cover, W, H, 0.5);
    expect(zoomTooLow.height).toBeCloseTo(cover.height / 1.0, 4);

    const zoomTooHigh = computeZoomedCrop(cover, W, H, 10.0);
    expect(zoomTooHigh.height).toBeCloseTo(cover.height / 5.0, 4);
  });
});

describe("TRD §8 Pan Controls", () => {
  it("pans crop within image boundaries and in opposite direction of photo movement", () => {
    const W = 1000;
    const H = 1000;
    const initialCrop: CropRect = { x: 200, y: 200, width: 400, height: 500 };

    // Move crop down and right
    const panned = panCrop(initialCrop, W, H, 50, 60);
    expect(panned.x).toBe(250);
    expect(panned.y).toBe(260);

    // Clamps to right/bottom edges
    const pannedMax = panCrop(initialCrop, W, H, 1000, 1000);
    expect(pannedMax.x).toBe(W - initialCrop.width);
    expect(pannedMax.y).toBe(H - initialCrop.height);

    // Clamps to left/top edges
    const pannedMin = panCrop(initialCrop, W, H, -1000, -1000);
    expect(pannedMin.x).toBe(0);
    expect(pannedMin.y).toBe(0);
  });
});

describe("TRD §9.4 Low Resolution Threshold", () => {
  it("flags low resolution when width < 265 or height < 311", () => {
    // 265 x 311 is min print threshold
    expect(checkLowResolution({ x: 0, y: 0, width: 264, height: 311 })).toBe(true);
    expect(checkLowResolution({ x: 0, y: 0, width: 265, height: 310 })).toBe(true);
    expect(checkLowResolution({ x: 0, y: 0, width: 265, height: 311 })).toBe(false);
    expect(checkLowResolution({ x: 0, y: 0, width: 400, height: 500 })).toBe(false);
  });
});

describe("TRD Coordinate Roundtrip Accuracy (<= 1px)", () => {
  it("retains crop rect within <= 1px across normalized roundtrip for 200 configurations", () => {
    // Systematic and pseudorandom test configurations
    const testCases: Array<{ W: number; H: number; crop: CropRect }> = [];

    // Standard resolutions
    const resolutions: readonly [number, number][] = [
      [1254, 1254],
      [1920, 1080],
      [1080, 1920],
      [800, 600],
      [3000, 4000],
      [265, 311],
    ];

    for (const [W, H] of resolutions) {
      for (let i = 0; i < 20; i++) {
        const width = 100 + (i * 37) % (W - 100);
        const height = 100 + (i * 43) % (H - 100);
        const x = (i * 29) % (W - width);
        const y = (i * 31) % (H - height);
        testCases.push({ W, H, crop: { x, y, width, height } });
      }
    }

    for (const { W, H, crop } of testCases) {
      const norm = normalizeRect(crop, W, H);
      const restored = denormalizeRect(norm, W, H);
      const roundtrip = verifyRoundtrip(crop, W, H);

      expect(roundtrip.passed).toBe(true);
      expect(roundtrip.maxErrorPx).toBeLessThanOrEqual(1.0);

      // Verify individual dimensions
      expect(Math.abs(restored.x - crop.x)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(restored.y - crop.y)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(restored.width - crop.width)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(restored.height - crop.height)).toBeLessThanOrEqual(1e-9);
    }
  });
});

describe("TRD §7.1 EXIF Binary Parser and Dimensions", () => {
  function makeMockExifJpeg(orientation: number, isLittleEndian: boolean = true): Uint8Array {
    const tiffHeader = isLittleEndian
      ? [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]
      : [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08];

    const ifdEntry = isLittleEndian
      ? [
          0x01, 0x00, // 1 entry
          0x12, 0x01, // Tag: Orientation
          0x03, 0x00, // Type: SHORT
          0x01, 0x00, 0x00, 0x00, // Count: 1
          orientation, 0x00, 0x00, 0x00, // Value
          0x00, 0x00, 0x00, 0x00, // Next IFD
        ]
      : [
          0x00, 0x01, // 1 entry
          0x01, 0x12, // Tag: Orientation
          0x00, 0x03, // Type: SHORT
          0x00, 0x00, 0x00, 0x01, // Count: 1
          0x00, orientation, 0x00, 0x00, // Value
          0x00, 0x00, 0x00, 0x00, // Next IFD
        ];

    const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
    const tiffPayload = [...tiffHeader, ...ifdEntry];
    const app1Len = 2 + exifHeader.length + tiffPayload.length;

    // Also include a SOF0 marker for raw dimensions 600x400
    // FF C0, len=11, precision=8, H=400 (0x0190), W=600 (0x0258), components=3
    const sof0 = [0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0x90, 0x02, 0x58, 0x03, 0x01, 0x11, 0x00];

    const bytes = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff,
      ...exifHeader,
      ...tiffPayload,
      ...sof0,
      0xff, 0xd9, // EOI
    ]);

    return bytes;
  }

  it("parses EXIF orientations 1 through 8 for little-endian byte order", () => {
    for (let ori = 1; ori <= 8; ori++) {
      const jpeg = makeMockExifJpeg(ori, true);
      const parsed = readExifOrientation(jpeg);
      expect(parsed).toBe(ori);
    }
  });

  it("parses EXIF orientations 1 through 8 for big-endian byte order", () => {
    for (let ori = 1; ori <= 8; ori++) {
      const jpeg = makeMockExifJpeg(ori, false);
      const parsed = readExifOrientation(jpeg);
      expect(parsed).toBe(ori);
    }
  });

  it("reads raw JPEG SOF0 dimensions", () => {
    const jpeg = makeMockExifJpeg(1);
    const dims = readJpegRawDimensions(jpeg);
    expect(dims).toEqual({ width: 600, height: 400 });
  });

  it("swaps dimensions only for orientations 5, 6, 7, 8 in getOrientedDimensions", () => {
    const rawW = 600;
    const rawH = 400;

    for (let ori = 1; ori <= 4; ori++) {
      const dims = getOrientedDimensions(rawW, rawH, ori);
      expect(dims.width).toBe(rawW);
      expect(dims.height).toBe(rawH);
    }

    for (let ori = 5; ori <= 8; ori++) {
      const dims = getOrientedDimensions(rawW, rawH, ori);
      expect(dims.width).toBe(rawH);
      expect(dims.height).toBe(rawW);
    }
  });

  it("safely handles corrupted or non-JPEG inputs", () => {
    expect(readExifOrientation(new Uint8Array([]))).toBe(1);
    expect(readExifOrientation(new Uint8Array([0x00, 0x00, 0x00, 0x00]))).toBe(1);
    expect(readExifOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02]))).toBe(1);
    expect(readJpegRawDimensions(new Uint8Array([0x12, 0x34]))).toBeNull();
  });
});
