import { normalizeImageOrientation } from "../../technical/imaging/exif";
import type { PhotoRecord } from "../types";
import { extractBaseFileName, normalizeMatchKey } from "./matching";

export const MAX_PHOTO_BYTES = 20 * 1024 * 1024; // 20 MiB per TRD §13

export interface ProcessPhotoError {
  readonly fileName: string;
  readonly reason: string;
}

export interface ProcessPhotosResult {
  readonly successful: readonly PhotoRecord[];
  readonly errors: readonly ProcessPhotoError[];
}

/**
 * Validates and decodes an uploaded photo file, applying EXIF orientation once.
 */
export async function processSinglePhoto(file: File): Promise<PhotoRecord> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["jpg", "jpeg", "png"].includes(ext)) {
    throw new Error("JPG, JPEG 또는 PNG 형식의 사진만 업로드할 수 있습니다.");
  }

  if (file.size === 0) {
    throw new Error("파일 크기가 0바이트인 빈 파일입니다.");
  }

  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error(
      `파일 크기가 ${(MAX_PHOTO_BYTES / (1024 * 1024)).toFixed(0)}MB 한도를 초과했습니다.`,
    );
  }

  const baseName = extractBaseFileName(file.name);
  if (!baseName.trim()) {
    throw new Error("파일 이름이 비어 있습니다.");
  }

  // EXIF-aware orientation normalization
  const oriented = await normalizeImageOrientation(file);

  const objectUrl = URL.createObjectURL(file);
  const id = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const matchKey = normalizeMatchKey(baseName);

  return {
    id,
    fileName: file.name,
    matchKey,
    objectUrl,
    canvas: oriented.canvas,
    width: oriented.width,
    height: oriented.height,
    exifOrientation: oriented.exifOrientation,
    ignored: false,
  };
}

/**
 * Concurrency-conscious photo batch decoder.
 * Limits simultaneous heavy ImageBitmap/Canvas operations to prevent memory spikes.
 */
export async function processPhotosBatch(
  files: readonly File[],
  concurrencyLimit: number = 2,
  onProgress?: (completed: number, total: number) => void,
): Promise<ProcessPhotosResult> {
  const successful: PhotoRecord[] = [];
  const errors: ProcessPhotoError[] = [];

  let nextIndex = 0;
  let completedCount = 0;
  const total = files.length;

  const worker = async () => {
    while (nextIndex < files.length) {
      const idx = nextIndex++;
      const file = files[idx];
      if (!file) continue;

      try {
        const record = await processSinglePhoto(file);
        successful.push(record);
      } catch (err) {
        errors.push({
          fileName: file.name,
          reason: err instanceof Error ? err.message : "사진 처리 중 오류가 발생했습니다.",
        });
      } finally {
        completedCount++;
        onProgress?.(completedCount, total);
      }
    }
  };

  const pool = Array.from(
    { length: Math.min(concurrencyLimit, files.length) },
    () => worker(),
  );

  await Promise.all(pool);
  return { successful, errors };
}

export function revokePhotoRecord(photo: PhotoRecord): void {
  try {
    URL.revokeObjectURL(photo.objectUrl);
  } catch {
    // Ignore revoke errors
  }
}

export function revokeAllPhotos(photos: readonly PhotoRecord[]): void {
  for (const photo of photos) {
    revokePhotoRecord(photo);
  }
}
