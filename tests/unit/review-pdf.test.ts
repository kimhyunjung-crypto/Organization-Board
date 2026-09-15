import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fontkitInstance } from "../../src/technical/pdf/fontLoader";
import { computeNameLayout } from "../../src/technical/pdf/nameLayout";
import { buildDocumentRenderPlan } from "../../src/technical/pdf/renderPlan";
import { generateBoardPdf } from "../../src/technical/pdf/pdfGenerator";

const bytes = new Uint8Array(readFileSync("public/assets/fonts/NanumGothic-ExtraBold.ttf"));
const font = fontkitInstance.create(bytes);

describe("Independent PDF failure and glyph boundary review", () => {
  it("rejects a failed photo instead of returning a printable blank card", async () => {
    const plan = buildDocumentRenderPlan([{
      employeeId: "synthetic-review", name: "김민준", jobCategory: "디자인",
      contractType: "정규직", photoCrop: { x: 0, y: 0, width: 265, height: 311 },
    }], font);
    const rejected = await generateBoardPdf(plan, bytes, async () => {
      throw new Error("Synthetic photo decode failure");
    }).then(() => false, () => true);
    expect(rejected).toBe(true);
  });

  it("keeps actual glyph ink inside the name area for tall supported Hangul", () => {
    const layout = computeNameLayout("훨훨훨훨훨훨훨훨", font);
    expect(layout.fits).toBe(true);
    const top = 30.4 * 72 / 25.4;
    const bottom = 37.8 * 72 / 25.4;
    for (const line of layout.lineMetrics) {
      const run = font.layout(line.text);
      for (let i = 0; i < run.glyphs.length; i++) {
        const glyph = run.glyphs[i]!;
        const dy = run.positions[i]?.yOffset ?? 0;
        const scale = layout.fontSize / font.unitsPerEm;
        expect(line.baselineYPt - (glyph.bbox.maxY + dy) * scale).toBeGreaterThanOrEqual(top - 1e-6);
        expect(line.baselineYPt - (glyph.bbox.minY + dy) * scale).toBeLessThanOrEqual(bottom + 1e-6);
      }
    }
  });
});
