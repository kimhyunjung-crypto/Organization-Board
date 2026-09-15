/**
 * Test cases for S00.03 Imaging Spike
 * Built using the synthetic portrait fixture with zero employee data.
 */

import syntheticPortraitUrl from "../../../tests/fixtures/images/synthetic-portrait.png?url";
import exif1Url from "../../../tests/fixtures/images/exif-1.jpg?url";
import exif2Url from "../../../tests/fixtures/images/exif-2.jpg?url";
import exif3Url from "../../../tests/fixtures/images/exif-3.jpg?url";
import exif4Url from "../../../tests/fixtures/images/exif-4.jpg?url";
import exif5Url from "../../../tests/fixtures/images/exif-5.jpg?url";
import exif6Url from "../../../tests/fixtures/images/exif-6.jpg?url";
import exif7Url from "../../../tests/fixtures/images/exif-7.jpg?url";
import exif8Url from "../../../tests/fixtures/images/exif-8.jpg?url";

export interface TestCaseDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly expectedFaceCount: number | "any";
  readonly expectedRequiresConfirmation: boolean;
  readonly expectedWarningCode?: string;
  readonly generate: () => Promise<{ blob: Blob; url: string; width: number; height: number }>;
}

let cachedSyntheticImage: HTMLImageElement | null = null;

async function getSyntheticImage(): Promise<HTMLImageElement> {
  if (cachedSyntheticImage) return cachedSyntheticImage;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(new Error(`Failed to load synthetic portrait: ${String(e)}`));
    img.src = syntheticPortraitUrl;
  });
  cachedSyntheticImage = img;
  return img;
}

export const TEST_CASES: readonly TestCaseDefinition[] = [
  {
    id: "single",
    name: "1. 단일 얼굴 (합성 인물 원본)",
    description: "1254 × 1254px 정면 합성 인물. 단일 얼굴 검출 및 55% 얼굴, 38% 눈높이 자동 크롭 검증.",
    expectedFaceCount: 1,
    expectedRequiresConfirmation: false,
    generate: async () => {
      const resp = await fetch(syntheticPortraitUrl);
      const blob = await resp.blob();
      const img = await getSyntheticImage();
      return { blob, url: syntheticPortraitUrl, width: img.naturalWidth, height: img.naturalHeight };
    },
  },
  {
    id: "none",
    name: "2. 얼굴 없음 (추상 그라디언트 패턴)",
    description: "인물이 없는 패턴 이미지. 검출 0건 시 중앙 cover fallback 및 '이 사진 사용' 확인 요구 검증.",
    expectedFaceCount: 0,
    expectedRequiresConfirmation: true,
    expectedWarningCode: "NO_FACE",
    generate: async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 700;
      const ctx = canvas.getContext("2d")!;
      const grad = ctx.createLinearGradient(0, 0, 600, 700);
      grad.addColorStop(0, "#2c3e50");
      grad.addColorStop(0.5, "#3498db");
      grad.addColorStop(1, "#2980b9");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 600, 700);

      // Add abstract geometric shapes
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.beginPath();
      ctx.arc(300, 350, 150, 0, Math.PI * 2);
      ctx.fill();

      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
      return { blob, url: URL.createObjectURL(blob), width: 600, height: 700 };
    },
  },
  {
    id: "multiple",
    name: "3. 다중 얼굴 (2인 합성 캔버스)",
    description: "한 이미지에 두 명의 합성 인물이 배치된 경우. 중앙 cover 크롭 및 다중 얼굴 경고 검증.",
    expectedFaceCount: 2,
    expectedRequiresConfirmation: true,
    expectedWarningCode: "MULTIPLE_FACES",
    generate: async () => {
      const img = await getSyntheticImage();
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 700;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#e0e0e0";
      ctx.fillRect(0, 0, 1200, 700);

      // Draw two portraits side by side
      ctx.drawImage(img, 50, 50, 500, 500);
      ctx.drawImage(img, 650, 50, 500, 500);

      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
      return { blob, url: URL.createObjectURL(blob), width: 1200, height: 700 };
    },
  },
  {
    id: "portrait",
    name: "4. 세로형 구도 (600 × 900px)",
    description: "세로로 긴 비율(H > W). 사진 비율(r=22.4/26.3)에 맞는 cover 및 얼굴 기준 크롭 검증.",
    expectedFaceCount: 1,
    expectedRequiresConfirmation: false,
    generate: async () => {
      const img = await getSyntheticImage();
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 900;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#f5f5f7";
      ctx.fillRect(0, 0, 600, 900);

      // Centered portrait in upper-middle area
      ctx.drawImage(img, 50, 100, 500, 500);

      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
      return { blob, url: URL.createObjectURL(blob), width: 600, height: 900 };
    },
  },
  {
    id: "landscape",
    name: "5. 가로형 구도 (1000 × 500px)",
    description: "가로로 넓은 비율(W > H). 가로 방향 중앙 정렬 및 여백 clamp 검증.",
    expectedFaceCount: 1,
    expectedRequiresConfirmation: false,
    generate: async () => {
      const img = await getSyntheticImage();
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 500;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#eaeaea";
      ctx.fillRect(0, 0, 1000, 500);

      // Center portrait
      ctx.drawImage(img, 300, 25, 400, 400);

      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
      return { blob, url: URL.createObjectURL(blob), width: 1000, height: 500 };
    },
  },
  {
    id: "edge",
    name: "6. 가장자리 인접 얼굴 (클램핑·구도 경고)",
    description: "얼굴이 상단 및 좌측 경계에 인접하여 clamp가 발생하고 구도 편차 경고가 발생하는 케이스.",
    expectedFaceCount: 1,
    expectedRequiresConfirmation: true,
    generate: async () => {
      const img = await getSyntheticImage();
      const canvas = document.createElement("canvas");
      canvas.width = 700;
      canvas.height = 700;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fafafa";
      ctx.fillRect(0, 0, 700, 700);

      // Place face high near top edge so eye level is clamped and deviates > 5%p
      ctx.drawImage(img, 0, -260, 700, 700);

      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
      return { blob, url: URL.createObjectURL(blob), width: 700, height: 700 };
    },
  },
  {
    id: "low-res",
    name: "7. 저해상도 이미지 (200 × 200px)",
    description: "출력 권장 크기(265 × 311px) 미만의 저해상도 원본. 저해상도 경고 발생 검증.",
    expectedFaceCount: 1,
    expectedRequiresConfirmation: true,
    expectedWarningCode: "LOW_RESOLUTION",
    generate: async () => {
      const img = await getSyntheticImage();
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, 200, 200);

      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
      return { blob, url: URL.createObjectURL(blob), width: 200, height: 200 };
    },
  },
  {
    id: "exif-1",
    name: "8. EXIF Orientation 1 (Normal 0°)",
    description: "실제 JPEG EXIF 태그 1. 정상 방향 검출 검증.",
    expectedFaceCount: 1,
    expectedRequiresConfirmation: false,
    generate: async () => {
      const resp = await fetch(exif1Url);
      const blob = await resp.blob();
      return { blob, url: exif1Url, width: 600, height: 500 };
    },
  },
  {
    id: "exif-2",
    name: "9. EXIF Orientation 2 (Mirror H)",
    description: "실제 JPEG EXIF 태그 2. 좌우 반전 보정 검증.",
    expectedFaceCount: 1,
    expectedRequiresConfirmation: false,
    generate: async () => {
      const resp = await fetch(exif2Url);
      const blob = await resp.blob();
      return { blob, url: exif2Url, width: 600, height: 500 };
    },
  },
  {
    id: "exif-3",
    name: "10. EXIF Orientation 3 (180° 회전)",
    description: "실제 JPEG EXIF 태그 3. 180도 회전 정상 디코딩 및 상하 정방향 검출 검증.",
    expectedFaceCount: 1,
    expectedRequiresConfirmation: false,
    generate: async () => {
      const resp = await fetch(exif3Url);
      const blob = await resp.blob();
      return { blob, url: exif3Url, width: 600, height: 500 };
    },
  },
  {
    id: "exif-4",
    name: "11. EXIF Orientation 4 (Mirror V)",
    description: "실제 JPEG EXIF 태그 4. 상하 반전 보정 검증.",
    expectedFaceCount: 1,
    expectedRequiresConfirmation: false,
    generate: async () => {
      const resp = await fetch(exif4Url);
      const blob = await resp.blob();
      return { blob, url: exif4Url, width: 600, height: 500 };
    },
  },
  {
    id: "exif-5",
    name: "12. EXIF Orientation 5 (Transpose)",
    description: "실제 JPEG EXIF 태그 5. 대각 반전(전치) 보정 검증.",
    expectedFaceCount: 1,
    expectedRequiresConfirmation: false,
    generate: async () => {
      const resp = await fetch(exif5Url);
      const blob = await resp.blob();
      return { blob, url: exif5Url, width: 600, height: 500 };
    },
  },
  {
    id: "exif-6",
    name: "13. EXIF Orientation 6 (90° 시계방향)",
    description: "실제 JPEG EXIF 태그 6. 세로/가로 전치 및 90도 회전 보정 검증.",
    expectedFaceCount: 1,
    expectedRequiresConfirmation: false,
    generate: async () => {
      const resp = await fetch(exif6Url);
      const blob = await resp.blob();
      return { blob, url: exif6Url, width: 600, height: 500 };
    },
  },
  {
    id: "exif-7",
    name: "14. EXIF Orientation 7 (Transverse)",
    description: "실제 JPEG EXIF 태그 7. 역대각 반전 보정 검증.",
    expectedFaceCount: 1,
    expectedRequiresConfirmation: false,
    generate: async () => {
      const resp = await fetch(exif7Url);
      const blob = await resp.blob();
      return { blob, url: exif7Url, width: 600, height: 500 };
    },
  },
  {
    id: "exif-8",
    name: "15. EXIF Orientation 8 (270° 시계방향)",
    description: "실제 JPEG EXIF 태그 8. 세로/가로 전치 및 270도 회전 보정 검증.",
    expectedFaceCount: 1,
    expectedRequiresConfirmation: false,
    generate: async () => {
      const resp = await fetch(exif8Url);
      const blob = await resp.blob();
      return { blob, url: exif8Url, width: 600, height: 500 };
    },
  },
];
