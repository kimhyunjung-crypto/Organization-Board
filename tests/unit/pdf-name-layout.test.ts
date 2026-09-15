import { beforeAll, describe, expect, it } from "vitest";
import { CARD_CONSTANTS, mmToPt } from "../../src/technical/pdf/constants";
import { loadNanumGothicFont, type FontkitFont } from "../../src/technical/pdf/fontLoader";
import {
  checkGlyphs,
  computeNameLayout,
  measureText,
} from "../../src/technical/pdf/nameLayout";

describe("TRD §9.3 & S00.04 Name Layout & Font Metrics", () => {
  let font: FontkitFont;

  beforeAll(async () => {
    const result = await loadNanumGothicFont();
    font = result.font;
  });

  describe("Glyph existence check", () => {
    it("recognizes standard Hangul and ASCII characters", () => {
      expect(checkGlyphs("홍길동", font).valid).toBe(true);
      expect(checkGlyphs("김철수", font).valid).toBe(true);
      expect(checkGlyphs("John Smith", font).valid).toBe(true);
      expect(checkGlyphs("Alex 123", font).valid).toBe(true);
    });

    it("rejects Japanese Kanji/Kana samples as MISSING_GLYPH", () => {
      const checkTanaka = checkGlyphs("田中 太郎", font);
      expect(checkTanaka.valid).toBe(false);
      expect(checkTanaka.missingGlyphs).toContain("田");
      expect(checkTanaka.missingGlyphs).toContain("中");

      const layout = computeNameLayout("田中 太郎", font);
      expect(layout.fits).toBe(false);
      expect(layout.error).toBe("MISSING_GLYPH");
      expect(layout.missingGlyphs).toBeDefined();
      expect(layout.missingGlyphs?.length).toBeGreaterThan(0);
    });

    it("rejects unsupported emoji as MISSING_GLYPH", () => {
      const checkEmoji = checkGlyphs("홍길동 😊", font);
      expect(checkEmoji.valid).toBe(false);
      expect(checkEmoji.missingGlyphs).toContain("😊");

      const layout = computeNameLayout("홍길동 😊", font);
      expect(layout.fits).toBe(false);
      expect(layout.error).toBe("MISSING_GLYPH");
    });

    it("rejects empty or whitespace-only name as EMPTY_NAME", () => {
      const layoutEmpty = computeNameLayout("", font);
      expect(layoutEmpty.fits).toBe(false);
      expect(layoutEmpty.error).toBe("EMPTY_NAME");

      const layoutSpaces = computeNameLayout("   ", font);
      expect(layoutSpaces.fits).toBe(false);
      expect(layoutSpaces.error).toBe("EMPTY_NAME");
    });
  });

  describe("12pt Single Line Layout", () => {
    const usableWidthPt = mmToPt(CARD_CONSTANTS.NAME_USABLE.WIDTH_MM); // ≈ 63.50 pt
    const usableHeightPt = mmToPt(CARD_CONSTANTS.NAME_USABLE.HEIGHT_MM); // ≈ 20.98 pt
    const usableLeftPt = mmToPt(CARD_CONSTANTS.NAME_USABLE.X_MM);
    const usableTopPt = mmToPt(CARD_CONSTANTS.NAME_USABLE.Y_MM);

    it("places 3-character Hangul names in 1 line at 12pt with centering", () => {
      const layout = computeNameLayout("홍길동", font);
      expect(layout.fits).toBe(true);
      expect(layout.fontSize).toBe(12);
      expect(layout.lines).toEqual(["홍길동"]);
      expect(layout.lineMetrics).toHaveLength(1);

      const metric = layout.lineMetrics[0]!;
      expect(metric.widthPt).toBeLessThanOrEqual(usableWidthPt);
      // Advance width of 홍길동 at 12pt is 33.84 pt
      expect(metric.widthPt).toBeCloseTo(33.84, 1);

      // Horizontal center check
      const expectedLeft = usableLeftPt + (usableWidthPt - metric.widthPt) / 2;
      expect(metric.xPt).toBeCloseTo(expectedLeft, 2);

      // Vertical center check: fits within usable name area (30.4mm to 37.8mm)
      expect(metric.baselineYPt).toBeGreaterThanOrEqual(usableTopPt);
      expect(metric.baselineYPt).toBeLessThanOrEqual(usableTopPt + usableHeightPt);
    });

    it("places 4-character and 5-character Hangul names in 1 line at 12pt if fitting", () => {
      const layout4 = computeNameLayout("남궁민수", font);
      expect(layout4.fits).toBe(true);
      expect(layout4.fontSize).toBe(12);
      expect(layout4.lines).toEqual(["남궁민수"]);
      expect(layout4.totalWidthPt).toBeCloseTo(45.12, 1);

      const layout5 = computeNameLayout("황보선생님", font);
      expect(layout5.fits).toBe(true);
      expect(layout5.fontSize).toBe(12);
      expect(layout5.lines).toEqual(["황보선생님"]);
      expect(layout5.totalWidthPt).toBeCloseTo(56.40, 1);
      expect(layout5.totalWidthPt).toBeLessThan(usableWidthPt);
    });

    it("places short English names in 1 line at 12pt", () => {
      const layout = computeNameLayout("John Smith", font);
      expect(layout.fits).toBe(true);
      expect(layout.fontSize).toBe(12);
      expect(layout.lines).toEqual(["John Smith"]);
      expect(layout.totalWidthPt).toBeLessThan(usableWidthPt);
    });
  });

  describe("10pt/9.5pt/9pt Multi-line Splits (TRD §9.3 Minimax Width)", () => {
    const usableWidthPt = mmToPt(CARD_CONSTANTS.NAME_USABLE.WIDTH_MM);

    it("prefers space boundaries for multi-line split when spaces exist", () => {
      // "김철수 연구원" overflows 12pt (71.64 pt > 63.50 pt)
      const layout = computeNameLayout("김철수 연구원", font);
      expect(layout.fits).toBe(true);
      expect(layout.fontSize).toBe(10);
      expect(layout.lines).toEqual(["김철수", "연구원"]);
      expect(layout.lineMetrics).toHaveLength(2);

      // Both lines must fit usable width
      expect(layout.lineMetrics[0]!.widthPt).toBeLessThanOrEqual(usableWidthPt);
      expect(layout.lineMetrics[1]!.widthPt).toBeLessThanOrEqual(usableWidthPt);

      // Line 2 baseline must be line 1 baseline + lineHeight (10 * 1.05 = 10.5 pt)
      const line1Baseline = layout.lineMetrics[0]!.baselineYPt;
      const line2Baseline = layout.lineMetrics[1]!.baselineYPt;
      expect(line2Baseline - line1Baseline).toBeCloseTo(10.5, 2);
    });

    it("splits long English names at spaces deterministically", () => {
      const layout = computeNameLayout("Alexander Hamilton", font);
      expect(layout.fits).toBe(true);
      expect(layout.fontSize).toBe(10);
      expect(layout.lines).toEqual(["Alexander", "Hamilton"]);
    });

    it("splits names without spaces using grapheme clusters and minimax width", () => {
      // "알렉산더피터슨" (7 chars Hangul, no space)
      // At 12pt: 78.96 pt (overflows)
      // At 10pt: 65.80 pt on 1 line (overflows)
      // Grapheme split at 10pt candidates:
      // "알렉산" (3 chars, 28.2 pt) / "더피터슨" (4 chars, 37.6 pt) -> maxW = 37.6 pt
      // "알렉산더" (4 chars, 37.6 pt) / "피터슨" (3 chars, 28.2 pt) -> maxW = 37.6 pt
      // By deterministic minimax tie-break (earlier splitIndex), "알렉산" / "더피터슨" is chosen!
      const layout = computeNameLayout("알렉산더피터슨", font);
      expect(layout.fits).toBe(true);
      expect(layout.fontSize).toBe(10);
      expect(layout.lines).toEqual(["알렉산", "더피터슨"]);
      expect(layout.totalWidthPt).toBeCloseTo(37.6, 1);
    });

    it("blocks text that exceeds 9pt 2-lines with NAME_OVERFLOW", () => {
      const superLongName = "Supercalifragilisticexpialidocious Longname Extra";
      const layout = computeNameLayout(superLongName, font);
      expect(layout.fits).toBe(false);
      expect(layout.error).toBe("NAME_OVERFLOW");
      expect(layout.errorMessage).toContain("초과하여");
    });
  });

  describe("Sub-pixel bounding box and ascent/descent fitting", () => {
    it("measures accurate ascent and descent according to unitsPerEm", () => {
      const m = measureText("홍길동", 10, font);
      expect(font.unitsPerEm).toBe(1000);
      expect(font.ascent).toBe(856);
      expect(font.descent).toBe(-144);
      expect(m.ascentPt).toBeCloseTo(8.56, 3);
      expect(m.descentPt).toBeCloseTo(-1.44, 3);
    });
  });
});
