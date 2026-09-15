import type { CardRects, ContractType, HexColor, JobCategory, RgbColor } from "./types";

export const PT_PER_MM = 72 / 25.4;

export function mmToPt(mm: number): number {
  return mm * PT_PER_MM;
}

export function ptToMm(pt: number): number {
  return pt / PT_PER_MM;
}

export const PAGE_CONSTANTS = {
  WIDTH_MM: 297,
  HEIGHT_MM: 210,
  WIDTH_PT: mmToPt(297),
  HEIGHT_PT: mmToPt(210),
  COLUMNS: 7,
  ROWS: 3,
  SLOTS_PER_PAGE: 21,
  ORIGIN_X_MM: 54.4,
  ORIGIN_Y_MM: 47.0,
  STEP_X_MM: 27.2, // 25 + 2.2
  STEP_Y_MM: 39.0, // 38 + 1.0
  GAP_X_MM: 2.2,
  GAP_Y_MM: 1.0,
} as const;

export const CARD_CONSTANTS = {
  WIDTH_MM: 25,
  HEIGHT_MM: 38,
  WIDTH_PT: mmToPt(25),
  HEIGHT_PT: mmToPt(38),

  OUTLINE_WIDTH_PT: 0.6,
  OUTLINE_INSET_PT: 0.3, // half-stroke inset
  OUTLINE_COLOR_HEX: "#444444" as HexColor,
  OUTLINE_COLOR_RGB: {
    r: 0x44 / 255,
    g: 0x44 / 255,
    b: 0x44 / 255,
  } as RgbColor,

  PHOTO: {
    X_MM: 1.3,
    Y_MM: 1.0,
    WIDTH_MM: 22.4,
    HEIGHT_MM: 26.3,
  },

  CHIP: {
    X_MM: 1.3,
    Y_MM: 27.3,
    WIDTH_MM: 22.4,
    HEIGHT_MM: 2.9,
  },

  NAME_AREA: {
    X_MM: 1.3,
    Y_MM: 30.2,
    WIDTH_MM: 22.4,
    HEIGHT_MM: 7.8, // provisional height
    PADDING_Y_MM: 0.2,
  },

  NAME_USABLE: {
    X_MM: 1.3,
    Y_MM: 30.4, // 30.2 + 0.2
    WIDTH_MM: 22.4,
    HEIGHT_MM: 7.4, // 7.8 - 2 * 0.2
  },
} as const;

export const DEFAULT_CARD_RECTS: CardRects = {
  card: {
    xMm: 0,
    yMm: 0,
    widthMm: CARD_CONSTANTS.WIDTH_MM,
    heightMm: CARD_CONSTANTS.HEIGHT_MM,
  },
  photo: {
    xMm: CARD_CONSTANTS.PHOTO.X_MM,
    yMm: CARD_CONSTANTS.PHOTO.Y_MM,
    widthMm: CARD_CONSTANTS.PHOTO.WIDTH_MM,
    heightMm: CARD_CONSTANTS.PHOTO.HEIGHT_MM,
  },
  chip: {
    xMm: CARD_CONSTANTS.CHIP.X_MM,
    yMm: CARD_CONSTANTS.CHIP.Y_MM,
    widthMm: CARD_CONSTANTS.CHIP.WIDTH_MM,
    heightMm: CARD_CONSTANTS.CHIP.HEIGHT_MM,
  },
  nameArea: {
    xMm: CARD_CONSTANTS.NAME_AREA.X_MM,
    yMm: CARD_CONSTANTS.NAME_AREA.Y_MM,
    widthMm: CARD_CONSTANTS.NAME_AREA.WIDTH_MM,
    heightMm: CARD_CONSTANTS.NAME_AREA.HEIGHT_MM,
  },
  nameUsable: {
    xMm: CARD_CONSTANTS.NAME_USABLE.X_MM,
    yMm: CARD_CONSTANTS.NAME_USABLE.Y_MM,
    widthMm: CARD_CONSTANTS.NAME_USABLE.WIDTH_MM,
    heightMm: CARD_CONSTANTS.NAME_USABLE.HEIGHT_MM,
  },
};

export const FONT_CONSTANTS = {
  ASSET_PATH: "/assets/fonts/NanumGothic-ExtraBold.ttf",
  FAMILY_NAME: "NanumGothicExtraBold",
  CANDIDATE_SIZES: [12, 10, 9.5, 9] as const,
  LINE_HEIGHT_FACTOR: 1.05,
} as const;

export const JOB_COLORS: Record<JobCategory, HexColor> = {
  디자인: "#FFAE01",
  서비스: "#FF01A2",
  "개발(CE)": "#0196FF",
  "백오피스(BP)": "#47B50B",
  QA: "#9900FF",
};

export const CONTRACT_COLORS: Record<Exclude<ContractType, "정규직">, HexColor> = {
  계약직: "#E6B8AF",
  아르바이트: "#737373",
  파견직: "#A4C2F4",
  인턴: "#00FFFF",
};
