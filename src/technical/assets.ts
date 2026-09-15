export const ASSET_MANIFEST_PATH = "/assets/manifest.json";

export interface AssetManifestEntry {
  readonly path: string;
  readonly source: string;
  readonly sha256: string;
  readonly license: string;
}

export interface AssetManifest {
  readonly assets: readonly AssetManifestEntry[];
}

export type AssetCheckState = "ready" | "error";

export interface AssetCheck {
  readonly path: string;
  readonly state: AssetCheckState;
  readonly detail: string;
}

export interface AssetReadiness {
  readonly ready: boolean;
  readonly checks: readonly AssetCheck[];
}

type Digest = (bytes: ArrayBuffer) => Promise<string>;

const REQUIRED_EXACT_PATHS = [
  "/assets/fonts/NanumGothic-ExtraBold.ttf",
  "/assets/models/blaze_face_short_range.tflite",
] as const;

const WASM_DIRECTORY = "/assets/mediapipe/wasm/";
const SHA_256_PATTERN = /^[a-f0-9]{64}$/iu;

function normalizeAssetPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function isSafeLocalAssetPath(path: string): boolean {
  const normalizedPath = normalizeAssetPath(path);
  return (
    normalizedPath.startsWith("/assets/") &&
    !normalizedPath.includes("\\") &&
    !normalizedPath.includes("..") &&
    !normalizedPath.includes("?") &&
    !normalizedPath.includes("#") &&
    !normalizedPath.includes("%")
  );
}

function isManifestEntry(value: unknown): value is AssetManifestEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.path === "string" &&
    isSafeLocalAssetPath(candidate.path) &&
    typeof candidate.source === "string" &&
    candidate.source.trim().length > 0 &&
    typeof candidate.license === "string" &&
    candidate.license.trim().length > 0 &&
    typeof candidate.sha256 === "string" &&
    SHA_256_PATTERN.test(candidate.sha256)
  );
}

export function parseAssetManifest(value: unknown): AssetManifest {
  if (typeof value !== "object" || value === null) {
    throw new Error("자산 목록이 객체가 아닙니다.");
  }

  const assets = (value as Record<string, unknown>).assets;
  if (!Array.isArray(assets) || !assets.every(isManifestEntry)) {
    throw new Error("자산 목록의 path, source, sha256, license를 확인해 주세요.");
  }

  const normalizedAssets = assets.map((asset) => ({
    ...asset,
    path: normalizeAssetPath(asset.path),
    sha256: asset.sha256.toLowerCase(),
  }));

  const paths = normalizedAssets.map((asset) => asset.path);
  for (const requiredPath of REQUIRED_EXACT_PATHS) {
    if (!paths.includes(requiredPath)) {
      throw new Error(`필수 자산이 목록에 없습니다: ${requiredPath}`);
    }
  }

  if (!paths.some((path) => path.startsWith(WASM_DIRECTORY) && path.endsWith(".wasm"))) {
    throw new Error(`MediaPipe WASM 자산이 목록에 없습니다: ${WASM_DIRECTORY}`);
  }

  if (!paths.some((path) => path.startsWith(WASM_DIRECTORY) && path.endsWith(".js"))) {
    throw new Error(`MediaPipe WASM 로더가 목록에 없습니다: ${WASM_DIRECTORY}`);
  }

  if (new Set(paths).size !== paths.length) {
    throw new Error("자산 목록에 중복 경로가 있습니다.");
  }

  return { assets: normalizedAssets };
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function inspectLocalAssets(
  fetcher: typeof fetch = globalThis.fetch,
  digest: Digest = sha256,
): Promise<AssetReadiness> {
  try {
    const manifestResponse = await fetcher(ASSET_MANIFEST_PATH, { cache: "no-store" });
    if (!manifestResponse.ok) {
      throw new Error(`자산 목록을 읽을 수 없습니다 (HTTP ${manifestResponse.status}).`);
    }

    const manifest = parseAssetManifest(await manifestResponse.json());
    const checks = await Promise.all(
      manifest.assets.map(async (asset): Promise<AssetCheck> => {
        try {
          const response = await fetcher(asset.path, { cache: "no-store" });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const actualHash = await digest(await response.arrayBuffer());
          if (actualHash.toLowerCase() !== asset.sha256) {
            throw new Error("SHA-256 불일치");
          }

          return {
            path: asset.path,
            state: "ready",
            detail: `${asset.license} · SHA-256 확인`,
          };
        } catch (error) {
          return {
            path: asset.path,
            state: "error",
            detail: error instanceof Error ? error.message : "알 수 없는 자산 검사 오류",
          };
        }
      }),
    );

    return {
      ready: checks.length > 0 && checks.every((check) => check.state === "ready"),
      checks,
    };
  } catch (error) {
    return {
      ready: false,
      checks: [
        {
          path: ASSET_MANIFEST_PATH,
          state: "error",
          detail: error instanceof Error ? error.message : "알 수 없는 자산 목록 오류",
        },
      ],
    };
  }
}
