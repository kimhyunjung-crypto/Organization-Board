import fontkitModule from "@pdf-lib/fontkit";
import { FONT_CONSTANTS } from "./constants";

// Type definition for fontkit font instance
export interface FontkitGlyph {
  readonly id: number;
  readonly name?: string;
  readonly codePoints: readonly number[];
  readonly advanceWidth: number;
  readonly bbox: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}

export interface FontkitGlyphPosition {
  readonly xOffset: number;
  readonly yOffset: number;
}

export interface FontkitGlyphRun {
  readonly glyphs: readonly FontkitGlyph[];
  readonly positions: readonly FontkitGlyphPosition[];
}

export interface FontkitFont {
  readonly postscriptName: string;
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly descent: number;
  readonly lineGap: number;
  readonly bbox: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  hasGlyphForCodePoint(codePoint: number): boolean;
  layout(text: string): FontkitGlyphRun;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fontkitInstance: any =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((fontkitModule as any).default ?? fontkitModule);

let cachedFontBytes: Uint8Array | null = null;
let cachedFontkitFont: FontkitFont | null = null;
let cachedFontFaceLoaded = false;

export async function loadNanumGothicBytes(
  fetcher: typeof fetch = globalThis.fetch,
): Promise<Uint8Array> {
  if (cachedFontBytes) {
    return cachedFontBytes;
  }

  // In Node / Vitest environment, read directly from public assets folder
  if (typeof process !== "undefined" && process.versions?.node) {
    try {
      const fs = await import(/* @vite-ignore */ "node:fs");
      const path = await import(/* @vite-ignore */ "node:path");
      const fontFilePath = path.resolve(process.cwd(), "public", "assets", "fonts", "NanumGothic-ExtraBold.ttf");
      if (fs.existsSync(fontFilePath)) {
        const buffer = fs.readFileSync(fontFilePath);
        cachedFontBytes = new Uint8Array(buffer);
        return cachedFontBytes;
      }
    } catch {
      // Continue to fetch if fs reading is not possible
    }
  }

  const response = await fetcher(FONT_CONSTANTS.ASSET_PATH);
  if (!response.ok) {
    throw new Error(`글꼴 파일을 불러올 수 없습니다: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  cachedFontBytes = new Uint8Array(arrayBuffer);
  return cachedFontBytes;
}

export async function loadNanumGothicFont(
  fetcher: typeof fetch = globalThis.fetch,
): Promise<{ readonly fontBytes: Uint8Array; readonly font: FontkitFont }> {
  const fontBytes = await loadNanumGothicBytes(fetcher);

  const font = cachedFontkitFont ?? (cachedFontkitFont = fontkitInstance.create(fontBytes));

  // If in browser, register FontFace so Canvas preview matches PDF
  if (typeof window !== "undefined" && typeof document !== "undefined" && !cachedFontFaceLoaded) {
    if ("FontFace" in window && "fonts" in document) {
      try {
        // Create an ArrayBuffer copy for FontFace to avoid detached buffer issues
        const fontBufferCopy = fontBytes.slice().buffer;
        const fontFace = new FontFace(FONT_CONSTANTS.FAMILY_NAME, fontBufferCopy, {
          weight: "800",
          style: "normal",
        });
        await fontFace.load();
        document.fonts.add(fontFace);
        cachedFontFaceLoaded = true;
      } catch (e) {
        throw new Error(
          `NanumGothic FontFace 로드에 실패했습니다: ${e instanceof Error ? e.message : String(e)}`,
          { cause: e },
        );
      }
    }
  }

  return {
    fontBytes,
    font,
  };
}

export function resetFontCache(): void {
  cachedFontBytes = null;
  cachedFontkitFont = null;
  cachedFontFaceLoaded = false;
}
