import { describe, expect, it, vi } from "vitest";
import { inspectLocalAssets, parseAssetManifest } from "../../src/technical/assets";

const hash = "a".repeat(64);
const manifest = {
  assets: [
    {
      path: "/assets/fonts/NanumGothic-ExtraBold.ttf",
      source: "https://example.invalid/font",
      sha256: hash,
      license: "OFL-1.1",
    },
    {
      path: "/assets/models/blaze_face_short_range.tflite",
      source: "https://example.invalid/model",
      sha256: hash,
      license: "Apache-2.0",
    },
    {
      path: "/assets/mediapipe/wasm/vision_wasm_internal.wasm",
      source: "https://example.invalid/wasm",
      sha256: hash,
      license: "Apache-2.0",
    },
    {
      path: "/assets/mediapipe/wasm/vision_wasm_internal.js",
      source: "https://example.invalid/loader",
      sha256: hash,
      license: "Apache-2.0",
    },
  ],
};

describe("local asset readiness", () => {
  it("requires the font, model, and at least one local WASM file", () => {
    expect(parseAssetManifest(manifest).assets).toHaveLength(4);
    expect(() => parseAssetManifest({ assets: manifest.assets.slice(0, 2) })).toThrow(/WASM/);
    expect(() => parseAssetManifest({ assets: manifest.assets.slice(0, 3) })).toThrow(/로더/);
    expect(() =>
      parseAssetManifest({
        assets: manifest.assets.map((asset, index) =>
          index === 0 ? { ...asset, path: "/assets/fonts/../secret.ttf" } : asset,
        ),
      }),
    ).toThrow(/path/);
  });

  it("checks every local asset against its manifest hash", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (String(input) === "/assets/manifest.json") {
        return new Response(JSON.stringify(manifest), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
    const digest = vi.fn(async () => hash);

    const result = await inspectLocalAssets(fetcher, digest);

    expect(result.ready).toBe(true);
    expect(result.checks).toHaveLength(4);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(digest).toHaveBeenCalledTimes(4);
  });

  it("reports a checksum mismatch without throwing", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      String(input) === "/assets/manifest.json"
        ? new Response(JSON.stringify(manifest), { status: 200 })
        : new Response(new Uint8Array([1]), { status: 200 }),
    );

    const result = await inspectLocalAssets(fetcher, async () => "b".repeat(64));

    expect(result.ready).toBe(false);
    expect(result.checks.every((check) => check.detail === "SHA-256 불일치")).toBe(true);
  });
});
