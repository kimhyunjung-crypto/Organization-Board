import type { CropRect } from "../imaging/types";

export type { FontkitFont } from "./fontLoader";

export type JobCategory = "디자인" | "서비스" | "개발" | "백오피스" | "QA";
export type ContractType = "정규직" | "계약직" | "아르바이트" | "파견직" | "인턴";

export type HexColor = `#${string}`;

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface RectDimensionsMm {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface RectDimensionsPt {
  readonly xPt: number;
  readonly yPt: number;
  readonly widthPt: number;
  readonly heightPt: number;
}

export interface CardRects {
  readonly card: RectDimensionsMm;
  readonly photo: RectDimensionsMm;
  readonly chip: RectDimensionsMm;
  readonly nameArea: RectDimensionsMm;
  readonly nameUsable: RectDimensionsMm;
}

export interface LineMetrics {
  readonly text: string;
  readonly widthPt: number;
  readonly xPt: number;
  readonly baselineYPt: number;
}

export type NameLayoutErrorCode = "EMPTY_NAME" | "MISSING_GLYPH" | "NAME_OVERFLOW";

export interface NameLayout {
  readonly rawName: string;
  readonly fontSize: number;
  readonly lines: readonly string[];
  readonly lineMetrics: readonly LineMetrics[];
  readonly totalWidthPt: number;
  readonly totalHeightPt: number;
  readonly fits: boolean;
  readonly error?: NameLayoutErrorCode;
  readonly errorMessage?: string;
  readonly missingGlyphs?: readonly string[];
}

export interface PagePosition {
  readonly pageIndex: number;
  readonly slotIndex: number;
  readonly column: number;
  readonly row: number;
  readonly xMm: number;
  readonly yMm: number;
}

export interface CardRenderPlan {
  readonly employeeId: string;
  readonly name: string;
  readonly jobCategory: JobCategory;
  readonly contractType: ContractType;
  readonly chipColorHex: HexColor;
  readonly chipColorRgb: RgbColor;
  readonly photoRevision: number;
  readonly photoCrop: CropRect;
  readonly photoSourceUrl?: string;
  readonly nameLayout: NameLayout;
  readonly pagePosition: PagePosition;
  readonly rects: CardRects;
}

export interface DocumentRenderPlan {
  readonly totalEmployees: number;
  readonly totalPages: number;
  readonly cards: readonly CardRenderPlan[];
  readonly blockingIssues: readonly string[];
  readonly isBlocked: boolean;
}

export type PhotoProvider = (plan: CardRenderPlan) => Promise<Uint8Array>;
