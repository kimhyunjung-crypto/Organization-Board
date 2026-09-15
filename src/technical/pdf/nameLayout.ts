import { CARD_CONSTANTS, FONT_CONSTANTS, mmToPt } from "./constants";
import type { FontkitFont } from "./fontLoader";
import type { NameLayout } from "./types";

export interface MeasureLineResult {
  readonly advanceWidthPt: number;
  readonly bboxWidthPt: number;
  readonly widthPt: number;
  readonly ascentPt: number;
  readonly descentPt: number;
  readonly maxGlyphYPt: number;
  readonly minGlyphYPt: number;
}

export function measureText(
  text: string,
  fontSize: number,
  font: FontkitFont,
): MeasureLineResult {
  const scale = fontSize / font.unitsPerEm;
  const ascentPt = font.ascent * scale;
  const descentPt = font.descent * scale;

  if (text.length === 0) {
    return {
      advanceWidthPt: 0,
      bboxWidthPt: 0,
      widthPt: 0,
      ascentPt,
      descentPt,
      maxGlyphYPt: ascentPt,
      minGlyphYPt: descentPt,
    };
  }

  const run = font.layout(text);
  let curX = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let maxGlyphY = -Infinity;
  let minGlyphY = Infinity;

  for (let i = 0; i < run.glyphs.length; i++) {
    const glyph = run.glyphs[i];
    if (!glyph) continue;
    const pos = run.positions[i];
    const offsetX = pos ? pos.xOffset * scale : 0;
    const offsetY = pos ? pos.yOffset * scale : 0;
    const gx = curX + offsetX;
    const gMinX = gx + glyph.bbox.minX * scale;
    const gMaxX = gx + glyph.bbox.maxX * scale;
    const gMaxY = glyph.bbox.maxY * scale + offsetY;
    const gMinY = glyph.bbox.minY * scale + offsetY;

    if (gMinX < minX) minX = gMinX;
    if (gMaxX > maxX) maxX = gMaxX;
    if (gMaxY > maxGlyphY) maxGlyphY = gMaxY;
    if (gMinY < minGlyphY) minGlyphY = gMinY;

    curX += (glyph.advanceWidth / font.unitsPerEm) * fontSize;
  }

  const advanceWidthPt = curX;
  const bboxWidthPt = Number.isFinite(maxX) && Number.isFinite(minX) ? Math.max(0, maxX - minX) : advanceWidthPt;
  const widthPt = Math.max(advanceWidthPt, bboxWidthPt);

  const maxGlyphYPt = Number.isFinite(maxGlyphY) ? maxGlyphY : ascentPt;
  const minGlyphYPt = Number.isFinite(minGlyphY) ? minGlyphY : descentPt;

  return {
    advanceWidthPt,
    bboxWidthPt,
    widthPt,
    ascentPt,
    descentPt,
    maxGlyphYPt,
    minGlyphYPt,
  };
}

export function checkGlyphs(
  text: string,
  font: FontkitFont,
): { readonly valid: boolean; readonly missingGlyphs: readonly string[] } {
  const missing: string[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0);
    if (cp === undefined || !font.hasGlyphForCodePoint(cp)) {
      if (!missing.includes(char)) {
        missing.push(char);
      }
    }
  }
  return {
    valid: missing.length === 0,
    missingGlyphs: missing,
  };
}

interface SplitCandidate {
  readonly line1: string;
  readonly line2: string;
  readonly w1: number;
  readonly w2: number;
  readonly maxW: number;
  readonly splitIndex: number;
  readonly inkTop: number;
  readonly twoLineHeightPt: number;
}

export function computeNameLayout(rawName: string, font: FontkitFont): NameLayout {
  const trimmed = rawName.trim();

  // 1. Empty name check
  if (trimmed.length === 0) {
    return {
      rawName,
      fontSize: 12,
      lines: [],
      lineMetrics: [],
      totalWidthPt: 0,
      totalHeightPt: 0,
      fits: false,
      error: "EMPTY_NAME",
      errorMessage: "이름이 비어 있습니다.",
    };
  }

  // 2. Missing glyph check
  const glyphCheck = checkGlyphs(trimmed, font);
  if (!glyphCheck.valid) {
    return {
      rawName,
      fontSize: 12,
      lines: [trimmed],
      lineMetrics: [],
      totalWidthPt: 0,
      totalHeightPt: 0,
      fits: false,
      error: "MISSING_GLYPH",
      errorMessage: `글꼴에 지원되지 않는 문자가 포함되어 있습니다: ${glyphCheck.missingGlyphs.join(", ")}`,
      missingGlyphs: glyphCheck.missingGlyphs,
    };
  }

  const usableWidthPt = mmToPt(CARD_CONSTANTS.NAME_USABLE.WIDTH_MM);
  const usableHeightPt = mmToPt(CARD_CONSTANTS.NAME_USABLE.HEIGHT_MM);
  const usableLeftPt = mmToPt(CARD_CONSTANTS.NAME_USABLE.X_MM);
  const usableTopPt = mmToPt(CARD_CONSTANTS.NAME_USABLE.Y_MM);

  // 3. Check 12pt single line
  const m12 = measureText(trimmed, 12, font);
  const inkTop12 = Math.max(m12.ascentPt, m12.maxGlyphYPt);
  const inkBottom12 = Math.min(m12.descentPt, m12.minGlyphYPt);
  const h12 = inkTop12 - inkBottom12;
  if (m12.widthPt <= usableWidthPt && h12 <= usableHeightPt) {
    const verticalOffset = (usableHeightPt - h12) / 2;
    const baselineYPt = usableTopPt + verticalOffset + inkTop12;
    const xPt = usableLeftPt + (usableWidthPt - m12.widthPt) / 2;

    return {
      rawName,
      fontSize: 12,
      lines: [trimmed],
      lineMetrics: [
        {
          text: trimmed,
          widthPt: m12.widthPt,
          xPt,
          baselineYPt,
        },
      ],
      totalWidthPt: m12.widthPt,
      totalHeightPt: h12,
      fits: true,
    };
  }

  // 4. Test 10pt, 9.5pt, 9.0pt (at most 2 lines, preferring spaces then grapheme split, minimax width)
  const candidateSizes = [10, 9.5, 9] as const;

  for (const size of candidateSizes) {
    const lineHeightPt = size * FONT_CONSTANTS.LINE_HEIGHT_FACTOR;

    // Step A: Prefer spaces if present
    const words = trimmed.split(/\s+/);
    const spaceCandidates: SplitCandidate[] = [];

    if (words.length >= 2) {
      for (let k = 1; k < words.length; k++) {
        const l1 = words.slice(0, k).join(" ").trim();
        const l2 = words.slice(k).join(" ").trim();
        if (l1.length > 0 && l2.length > 0) {
          const m1 = measureText(l1, size, font);
          const m2 = measureText(l2, size, font);
          const inkTop = Math.max(m1.ascentPt, m1.maxGlyphYPt);
          const inkBottom = Math.min(m2.descentPt, m2.minGlyphYPt);
          const twoLineHeight = inkTop + lineHeightPt + (-inkBottom);

          if (m1.widthPt <= usableWidthPt && m2.widthPt <= usableWidthPt && twoLineHeight <= usableHeightPt) {
            spaceCandidates.push({
              line1: l1,
              line2: l2,
              w1: m1.widthPt,
              w2: m2.widthPt,
              maxW: Math.max(m1.widthPt, m2.widthPt),
              splitIndex: k,
              inkTop,
              twoLineHeightPt: twoLineHeight,
            });
          }
        }
      }
    }

    if (spaceCandidates.length > 0) {
      // Minimax selection: min maxW, if tied pick earlier splitIndex
      spaceCandidates.sort((a, b) => {
        if (Math.abs(a.maxW - b.maxW) > 1e-4) {
          return a.maxW - b.maxW;
        }
        return a.splitIndex - b.splitIndex;
      });

      const best = spaceCandidates[0]!;
      const verticalOffset = (usableHeightPt - best.twoLineHeightPt) / 2;
      const line1Baseline = usableTopPt + verticalOffset + best.inkTop;
      const line2Baseline = line1Baseline + lineHeightPt;

      return {
        rawName,
        fontSize: size,
        lines: [best.line1, best.line2],
        lineMetrics: [
          {
            text: best.line1,
            widthPt: best.w1,
            xPt: usableLeftPt + (usableWidthPt - best.w1) / 2,
            baselineYPt: line1Baseline,
          },
          {
            text: best.line2,
            widthPt: best.w2,
            xPt: usableLeftPt + (usableWidthPt - best.w2) / 2,
            baselineYPt: line2Baseline,
          },
        ],
        totalWidthPt: best.maxW,
        totalHeightPt: best.twoLineHeightPt,
        fits: true,
      };
    }

    // Step B: Grapheme cluster split if no spaces or space split failed
    const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
    const graphemes = Array.from(segmenter.segment(trimmed), (s) => s.segment);
    const graphemeCandidates: SplitCandidate[] = [];

    if (graphemes.length >= 2) {
      for (let j = 1; j < graphemes.length; j++) {
        const l1 = graphemes.slice(0, j).join("").trim();
        const l2 = graphemes.slice(j).join("").trim();
        if (l1.length > 0 && l2.length > 0) {
          const m1 = measureText(l1, size, font);
          const m2 = measureText(l2, size, font);
          const inkTop = Math.max(m1.ascentPt, m1.maxGlyphYPt);
          const inkBottom = Math.min(m2.descentPt, m2.minGlyphYPt);
          const twoLineHeight = inkTop + lineHeightPt + (-inkBottom);

          if (m1.widthPt <= usableWidthPt && m2.widthPt <= usableWidthPt && twoLineHeight <= usableHeightPt) {
            graphemeCandidates.push({
              line1: l1,
              line2: l2,
              w1: m1.widthPt,
              w2: m2.widthPt,
              maxW: Math.max(m1.widthPt, m2.widthPt),
              splitIndex: j,
              inkTop,
              twoLineHeightPt: twoLineHeight,
            });
          }
        }
      }
    }

    if (graphemeCandidates.length > 0) {
      graphemeCandidates.sort((a, b) => {
        if (Math.abs(a.maxW - b.maxW) > 1e-4) {
          return a.maxW - b.maxW;
        }
        return a.splitIndex - b.splitIndex;
      });

      const best = graphemeCandidates[0]!;
      const verticalOffset = (usableHeightPt - best.twoLineHeightPt) / 2;
      const line1Baseline = usableTopPt + verticalOffset + best.inkTop;
      const line2Baseline = line1Baseline + lineHeightPt;

      return {
        rawName,
        fontSize: size,
        lines: [best.line1, best.line2],
        lineMetrics: [
          {
            text: best.line1,
            widthPt: best.w1,
            xPt: usableLeftPt + (usableWidthPt - best.w1) / 2,
            baselineYPt: line1Baseline,
          },
          {
            text: best.line2,
            widthPt: best.w2,
            xPt: usableLeftPt + (usableWidthPt - best.w2) / 2,
            baselineYPt: line2Baseline,
          },
        ],
        totalWidthPt: best.maxW,
        totalHeightPt: best.twoLineHeightPt,
        fits: true,
      };
    }

    // Step C: Fallback to single line at this size if fits
    const mSingle = measureText(trimmed, size, font);
    const inkTopSingle = Math.max(mSingle.ascentPt, mSingle.maxGlyphYPt);
    const inkBottomSingle = Math.min(mSingle.descentPt, mSingle.minGlyphYPt);
    const hSingle = inkTopSingle - inkBottomSingle;
    if (mSingle.widthPt <= usableWidthPt && hSingle <= usableHeightPt) {
      const verticalOffset = (usableHeightPt - hSingle) / 2;
      const baselineYPt = usableTopPt + verticalOffset + inkTopSingle;
      const xPt = usableLeftPt + (usableWidthPt - mSingle.widthPt) / 2;

      return {
        rawName,
        fontSize: size,
        lines: [trimmed],
        lineMetrics: [
          {
            text: trimmed,
            widthPt: mSingle.widthPt,
            xPt,
            baselineYPt,
          },
        ],
        totalWidthPt: mSingle.widthPt,
        totalHeightPt: hSingle,
        fits: true,
      };
    }
  }

  // 5. Overflow
  return {
    rawName,
    fontSize: 9,
    lines: [trimmed],
    lineMetrics: [],
    totalWidthPt: m12.widthPt,
    totalHeightPt: h12,
    fits: false,
    error: "NAME_OVERFLOW",
    errorMessage: "이름이 허용 영역(22.4 × 7.4mm)을 초과하여 출력할 수 없습니다. 이름을 수정해 주세요.",
  };
}
