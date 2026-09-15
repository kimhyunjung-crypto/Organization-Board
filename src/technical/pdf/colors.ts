import { CONTRACT_COLORS, JOB_COLORS } from "./constants";
import type { ContractType, HexColor, JobCategory, RgbColor } from "./types";

export function hexToRgb(hex: string): RgbColor {
  const cleanHex = hex.replace("#", "").trim();
  if (cleanHex.length !== 6) {
    throw new Error(`잘못된 HEX 색상 형식입니다: ${hex}`);
  }
  const num = parseInt(cleanHex, 16);
  if (Number.isNaN(num)) {
    throw new Error(`HEX 색상을 숫자로 변환할 수 없습니다: ${hex}`);
  }
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return { r, g, b };
}

/**
 * Resolves chip color according to TRD §9.2:
 * Contract-specific color takes precedence, except for "정규직" which uses the job category color.
 */
export function resolveChipColor(
  job: JobCategory,
  contract: ContractType,
): { readonly hex: HexColor; readonly rgb: RgbColor } {
  let hex: HexColor;
  if (contract === "정규직") {
    hex = JOB_COLORS[job];
    if (!hex) {
      throw new Error(`알 수 없는 직군입니다: ${job}`);
    }
  } else {
    hex = CONTRACT_COLORS[contract];
    if (!hex) {
      throw new Error(`알 수 없는 계약형태입니다: ${contract}`);
    }
  }

  return {
    hex,
    rgb: hexToRgb(hex),
  };
}
