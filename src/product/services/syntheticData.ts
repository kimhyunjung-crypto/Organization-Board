import type { ContractType, Employee, JobCategory } from "../types";

export interface SyntheticEmployeeSeed {
  readonly name: string;
  readonly jobCategory: JobCategory;
  readonly contractType: ContractType;
  readonly photoBgColor: string;
}

export const SYNTHETIC_SAMPLE_SEEDS: readonly SyntheticEmployeeSeed[] = [
  { name: "김태희", jobCategory: "디자인", contractType: "정규직", photoBgColor: "#FFE8D6" },
  { name: "이준호", jobCategory: "개발", contractType: "정규직", photoBgColor: "#D8E2DC" },
  { name: "박서진", jobCategory: "서비스", contractType: "계약직", photoBgColor: "#ECE4DB" },
  { name: "최민수", jobCategory: "백오피스", contractType: "정규직", photoBgColor: "#E8E8E4" },
  { name: "정다은", jobCategory: "QA", contractType: "인턴", photoBgColor: "#FCD5CE" },
  { name: "강현우", jobCategory: "개발", contractType: "파견직", photoBgColor: "#E2ECE9" },
  { name: "조유나", jobCategory: "디자인", contractType: "아르바이트", photoBgColor: "#DFE7FD" },
] as const;

/**
 * Creates synthetic portrait image Canvas and File.
 * Draws an avatar with head, shoulders, and features positioned around
 * the standard eye level (38%) and face proportion (55%) for face detector or fallback testing.
 */
export async function createSyntheticPortrait(
  name: string,
  bgColor: string = "#E0E7FF",
  width: number = 600,
  height: number = 800,
): Promise<{ file: File; canvas: HTMLCanvasElement }> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context creation failed");
  }

  // 1. Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // 2. Body / Shoulders
  ctx.fillStyle = "#4A5568";
  ctx.beginPath();
  ctx.ellipse(width / 2, height + 50, width * 0.45, height * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3. Neck
  ctx.fillStyle = "#E2B897";
  ctx.fillRect(width * 0.42, height * 0.45, width * 0.16, height * 0.2);

  // 4. Head (Face centered horizontally, eyes around 38% height)
  const faceCenterY = height * 0.38;
  const faceRadiusX = width * 0.22;
  const faceRadiusY = height * 0.22;

  // Hair back
  ctx.fillStyle = "#2D3748";
  ctx.beginPath();
  ctx.arc(width / 2, faceCenterY - 10, faceRadiusX * 1.15, 0, Math.PI * 2);
  ctx.fill();

  // Face oval
  ctx.fillStyle = "#F6D5B8";
  ctx.beginPath();
  ctx.ellipse(width / 2, faceCenterY, faceRadiusX, faceRadiusY, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair front
  ctx.fillStyle = "#2D3748";
  ctx.beginPath();
  ctx.arc(width / 2, faceCenterY - faceRadiusY * 0.5, faceRadiusX * 0.95, Math.PI, Math.PI * 2);
  ctx.fill();

  // Eyes (around 38% height)
  const eyeY = height * 0.38;
  const eyeDistance = width * 0.1;

  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.ellipse(width / 2 - eyeDistance, eyeY, 14, 8, 0, 0, Math.PI * 2);
  ctx.ellipse(width / 2 + eyeDistance, eyeY, 14, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1A202C";
  ctx.beginPath();
  ctx.arc(width / 2 - eyeDistance, eyeY, 6, 0, Math.PI * 2);
  ctx.arc(width / 2 + eyeDistance, eyeY, 6, 0, Math.PI * 2);
  ctx.fill();

  // Eyebrows
  ctx.strokeStyle = "#2D3748";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(width / 2 - eyeDistance, eyeY - 14, 16, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(width / 2 + eyeDistance, eyeY - 14, 16, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();

  // Nose
  ctx.strokeStyle = "#D4A373";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(width / 2, eyeY + 10);
  ctx.lineTo(width / 2 - 4, eyeY + 28);
  ctx.lineTo(width / 2 + 6, eyeY + 28);
  ctx.stroke();

  // Smile
  ctx.strokeStyle = "#C57B57";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(width / 2, eyeY + 36, 18, 0.2, Math.PI - 0.2);
  ctx.stroke();

  // Bottom watermark badge
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, height - 48, width, 48);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`[합성 사진] ${name}`, width / 2, height - 24);

  // Convert to JPEG blob / File
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Canvas blob conversion failed"));
      },
      "image/jpeg",
      0.92,
    );
  });

  const file = new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  return { file, canvas };
}

export function generateSyntheticEmployees(): Employee[] {
  return SYNTHETIC_SAMPLE_SEEDS.map((seed, index) => ({
    id: `emp-synthetic-${index + 1}`,
    order: index + 1,
    name: seed.name,
    matchKey: seed.name.trim().toLowerCase(),
    jobCategory: seed.jobCategory,
    contractType: seed.contractType,
  }));
}
