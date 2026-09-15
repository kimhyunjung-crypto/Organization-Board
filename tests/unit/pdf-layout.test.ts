import { beforeAll, describe, expect, it } from "vitest";
import { resolveChipColor } from "../../src/technical/pdf/colors";
import {
  CARD_CONSTANTS,
  CONTRACT_COLORS,
  JOB_COLORS,
  PAGE_CONSTANTS,
} from "../../src/technical/pdf/constants";
import { loadNanumGothicFont, type FontkitFont } from "../../src/technical/pdf/fontLoader";
import {
  buildDocumentRenderPlan,
  computePagePosition,
  type EmployeeCardInput,
} from "../../src/technical/pdf/renderPlan";
import type { ContractType, JobCategory } from "../../src/technical/pdf/types";

describe("TRD §9.1, §9.2 & §10.1 Card & A4 Grid Layout", () => {
  let font: FontkitFont;

  beforeAll(async () => {
    const result = await loadNanumGothicFont();
    font = result.font;
  });

  describe("Card Dimensions & Internal Insets (TRD §9.1)", () => {
    it("has exact outer dimensions 25 × 38 mm", () => {
      expect(CARD_CONSTANTS.WIDTH_MM).toBe(25);
      expect(CARD_CONSTANTS.HEIGHT_MM).toBe(38);
    });

    it("has outline 0.6pt with 0.3pt inset half-stroke", () => {
      expect(CARD_CONSTANTS.OUTLINE_WIDTH_PT).toBe(0.6);
      expect(CARD_CONSTANTS.OUTLINE_INSET_PT).toBe(0.3);
      expect(CARD_CONSTANTS.OUTLINE_COLOR_HEX).toBe("#444444");
    });

    it("has non-overlapping internal vertical partitions summing to exactly 38.0 mm", () => {
      const topGap = CARD_CONSTANTS.PHOTO.Y_MM; // 1.0
      const photoH = CARD_CONSTANTS.PHOTO.HEIGHT_MM; // 26.3
      const chipH = CARD_CONSTANTS.CHIP.HEIGHT_MM; // 2.9
      const nameH = CARD_CONSTANTS.NAME_AREA.HEIGHT_MM; // 7.8 (provisional)

      expect(topGap + photoH).toBeCloseTo(CARD_CONSTANTS.CHIP.Y_MM, 5); // 27.3 mm
      expect(CARD_CONSTANTS.CHIP.Y_MM + chipH).toBeCloseTo(CARD_CONSTANTS.NAME_AREA.Y_MM, 5); // 30.2 mm
      expect(CARD_CONSTANTS.NAME_AREA.Y_MM + nameH).toBeCloseTo(CARD_CONSTANTS.HEIGHT_MM, 5); // 38.0 mm
    });

    it("has 22.4 × 7.4 mm usable name area with 0.2 mm padding", () => {
      expect(CARD_CONSTANTS.NAME_USABLE.WIDTH_MM).toBe(22.4);
      expect(CARD_CONSTANTS.NAME_USABLE.HEIGHT_MM).toBe(7.4);
      expect(CARD_CONSTANTS.NAME_USABLE.Y_MM).toBe(30.4);
      expect(CARD_CONSTANTS.NAME_AREA.HEIGHT_MM - 2 * CARD_CONSTANTS.NAME_AREA.PADDING_Y_MM).toBeCloseTo(7.4, 5);
    });
  });

  describe("Chip Color Resolution (TRD §9.2)", () => {
    const jobs: JobCategory[] = ["디자인", "서비스", "개발(CE)", "백오피스(BP)", "QA"];
    const nonRegularContracts: Exclude<ContractType, "정규직">[] = [
      "계약직",
      "아르바이트",
      "파견직",
      "인턴",
    ];

    it("resolves regular contracts (정규직) to their respective job category colors", () => {
      for (const job of jobs) {
        const resolved = resolveChipColor(job, "정규직");
        expect(resolved.hex).toBe(JOB_COLORS[job]);
        expect(resolved.rgb.r).toBeCloseTo(parseInt(resolved.hex.slice(1, 3), 16) / 255, 3);
        expect(resolved.rgb.g).toBeCloseTo(parseInt(resolved.hex.slice(3, 5), 16) / 255, 3);
        expect(resolved.rgb.b).toBeCloseTo(parseInt(resolved.hex.slice(5, 7), 16) / 255, 3);
      }
    });

    it("resolves non-regular contracts to their designated contract colors regardless of job", () => {
      for (const contract of nonRegularContracts) {
        const expectedHex = CONTRACT_COLORS[contract];
        for (const job of jobs) {
          const resolved = resolveChipColor(job, contract);
          expect(resolved.hex).toBe(expectedHex);
        }
      }
    });

    it("verifies exact HEX values from TRD §9.2 table", () => {
      expect(resolveChipColor("디자인", "정규직").hex).toBe("#FFAE01");
      expect(resolveChipColor("서비스", "정규직").hex).toBe("#FF01A2");
      expect(resolveChipColor("개발(CE)", "정규직").hex).toBe("#0196FF");
      expect(resolveChipColor("백오피스(BP)", "정규직").hex).toBe("#47B50B");
      expect(resolveChipColor("QA", "정규직").hex).toBe("#9900FF");

      expect(resolveChipColor("개발(CE)", "계약직").hex).toBe("#E6B8AF");
      expect(resolveChipColor("디자인", "아르바이트").hex).toBe("#737373");
      expect(resolveChipColor("서비스", "파견직").hex).toBe("#A4C2F4");
      expect(resolveChipColor("백오피스(BP)", "인턴").hex).toBe("#00FFFF");
    });
  });

  describe("A4 Landscape Grid Calculation (TRD §10.1)", () => {
    it("has 7 columns × 3 rows = 21 slots per page", () => {
      expect(PAGE_CONSTANTS.COLUMNS).toBe(7);
      expect(PAGE_CONSTANTS.ROWS).toBe(3);
      expect(PAGE_CONSTANTS.SLOTS_PER_PAGE).toBe(21);
      expect(PAGE_CONSTANTS.WIDTH_MM).toBe(297);
      expect(PAGE_CONSTANTS.HEIGHT_MM).toBe(210);
    });

    it("calculates origin and step increments exactly", () => {
      // gridWidth = 7 * 25 + 6 * 2.2 = 188.2 mm
      const gridWidth = 7 * 25 + 6 * 2.2;
      expect(gridWidth).toBeCloseTo(188.2, 5);
      // gridHeight = 3 * 38 + 2 * 1.0 = 116 mm
      const gridHeight = 3 * 38 + 2 * 1.0;
      expect(gridHeight).toBeCloseTo(116.0, 5);

      // left = (297 - 188.2) / 2 = 54.4 mm
      expect(PAGE_CONSTANTS.ORIGIN_X_MM).toBeCloseTo((297 - gridWidth) / 2, 5);
      // top = (210 - 116) / 2 = 47 mm
      expect(PAGE_CONSTANTS.ORIGIN_Y_MM).toBeCloseTo((210 - gridHeight) / 2, 5);

      expect(PAGE_CONSTANTS.STEP_X_MM).toBe(27.2);
      expect(PAGE_CONSTANTS.STEP_Y_MM).toBe(39.0);
    });

    it("computes exact page positions for slot 0, slot 20, and slot 21 (boundary counts)", () => {
      // Slot 0 (1st person, page 0)
      const p0 = computePagePosition(0);
      expect(p0.pageIndex).toBe(0);
      expect(p0.slotIndex).toBe(0);
      expect(p0.column).toBe(0);
      expect(p0.row).toBe(0);
      expect(p0.xMm).toBeCloseTo(54.4, 5);
      expect(p0.yMm).toBeCloseTo(47.0, 5);

      // Slot 20 (21st person, last person on page 0)
      const p20 = computePagePosition(20);
      expect(p20.pageIndex).toBe(0);
      expect(p20.slotIndex).toBe(20);
      expect(p20.column).toBe(6);
      expect(p20.row).toBe(2);
      expect(p20.xMm).toBeCloseTo(54.4 + 6 * 27.2, 5); // 217.6 mm
      expect(p20.yMm).toBeCloseTo(47.0 + 2 * 39.0, 5); // 125.0 mm

      // Slot 21 (22nd person, 1st person on page 1)
      const p21 = computePagePosition(21);
      expect(p21.pageIndex).toBe(1);
      expect(p21.slotIndex).toBe(0);
      expect(p21.column).toBe(0);
      expect(p21.row).toBe(0);
      expect(p21.xMm).toBeCloseTo(54.4, 5);
      expect(p21.yMm).toBeCloseTo(47.0, 5);
    });

    it("handles boundary document plans (0, 1, 21, 22, 42, 43 employees)", () => {
      const makeEmployees = (n: number): EmployeeCardInput[] =>
        Array.from({ length: n }, (_, i) => ({
          employeeId: `e-${i}`,
          name: `직원${i + 1}`,
          jobCategory: "디자인",
          contractType: "정규직",
          photoCrop: { x: 0, y: 0, width: 224, height: 263 },
        }));

      // 0 employees: blocked
      const doc0 = buildDocumentRenderPlan(makeEmployees(0), font);
      expect(doc0.totalEmployees).toBe(0);
      expect(doc0.totalPages).toBe(0);
      expect(doc0.isBlocked).toBe(true);
      expect(doc0.blockingIssues).toHaveLength(1);

      // 1 employee: 1 page
      const doc1 = buildDocumentRenderPlan(makeEmployees(1), font);
      expect(doc1.totalPages).toBe(1);
      expect(doc1.cards).toHaveLength(1);
      expect(doc1.isBlocked).toBe(false);

      // 21 employees: 1 page
      const doc21 = buildDocumentRenderPlan(makeEmployees(21), font);
      expect(doc21.totalPages).toBe(1);
      expect(doc21.cards).toHaveLength(21);
      expect(doc21.isBlocked).toBe(false);

      // 22 employees: 2 pages (page 1: 21, page 2: 1)
      const doc22 = buildDocumentRenderPlan(makeEmployees(22), font);
      expect(doc22.totalPages).toBe(2);
      expect(doc22.cards).toHaveLength(22);
      expect(doc22.cards.filter((c) => c.pagePosition.pageIndex === 0)).toHaveLength(21);
      expect(doc22.cards.filter((c) => c.pagePosition.pageIndex === 1)).toHaveLength(1);
      expect(doc22.isBlocked).toBe(false);

      // 42 employees: 2 pages
      const doc42 = buildDocumentRenderPlan(makeEmployees(42), font);
      expect(doc42.totalPages).toBe(2);

      // 43 employees: 3 pages
      const doc43 = buildDocumentRenderPlan(makeEmployees(43), font);
      expect(doc43.totalPages).toBe(3);
    });

    it("blocks document plan if any employee name overflows or has missing glyph", () => {
      const invalidEmployees: EmployeeCardInput[] = [
        {
          employeeId: "ok-1",
          name: "홍길동",
          jobCategory: "디자인",
          contractType: "정규직",
          photoCrop: { x: 0, y: 0, width: 224, height: 263 },
        },
        {
          employeeId: "bad-1",
          name: "田中 太郎", // Japanese kanji missing glyph
          jobCategory: "개발(CE)",
          contractType: "정규직",
          photoCrop: { x: 0, y: 0, width: 224, height: 263 },
        },
      ];

      const doc = buildDocumentRenderPlan(invalidEmployees, font);
      expect(doc.isBlocked).toBe(true);
      expect(doc.blockingIssues[0]).toContain("田中 太郎");
      expect(doc.blockingIssues[0]).toContain("지원되지 않는 문자");
    });
  });
});
