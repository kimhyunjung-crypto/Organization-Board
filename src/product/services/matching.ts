import type { Employee, PhotoItem, PhotoLink } from "../types";

/**
 * Normalizes a string for matching comparison per TRD §6.2:
 * normalizeMatch(s) = NFC(s).trim().replace(/\s+/gu, " ").toLowerCase()
 * Preserves numbers, parentheses, and punctuation.
 */
export function normalizeMatchKey(raw: string): string {
  if (!raw) return "";
  return raw
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLowerCase();
}

/**
 * Strips the last file extension from a filename.
 * E.g. "김현정.jpg" -> "김현정", "photo.backup.png" -> "photo.backup"
 */
export function extractBaseFileName(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) return fileName;
  return fileName.slice(0, lastDot);
}

export interface MatchingResult {
  readonly links: readonly PhotoLink[];
  readonly autoCount: number;
  readonly manualCount: number;
  readonly unmatchedEmployees: readonly Employee[];
  readonly unmatchedPhotos: readonly PhotoItem[];
  readonly conflictEmployeeIds: ReadonlySet<string>;
  readonly conflictPhotoIds: ReadonlySet<string>;
}

/**
 * Executes conservative matching in accordance with TRD §6.2 and FRD F3.4, F3.5:
 * 1. Preserves existing valid manual links.
 * 2. Groups remaining employees and non-ignored photos by normalizeMatchKey.
 * 3. Only automatically links when key count is EXACTLY 1 on both sides.
 * 4. Homonyms (2+ employees) and duplicate photos (2+ photos) are left unlinked for manual connection.
 */
export function calculateMatches(
  employees: readonly Employee[],
  photos: readonly PhotoItem[],
  existingLinks: readonly PhotoLink[],
): { links: PhotoLink[]; autoLinkedCount: number } {
  const resultLinks: PhotoLink[] = [];
  const linkedEmployeeIds = new Set<string>();
  const linkedPhotoIds = new Set<string>();

  // 1. First keep existing manual links if both employee and photo still exist
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const photoMap = new Map(photos.map((p) => [p.id, p]));

  for (const link of existingLinks) {
    if (link.mode === "manual" && empMap.has(link.employeeId) && photoMap.has(link.photoId)) {
      resultLinks.push(link);
      linkedEmployeeIds.add(link.employeeId);
      linkedPhotoIds.add(link.photoId);
    }
  }

  // 2. Available employees and photos for matching
  const availableEmployees = employees.filter((e) => !linkedEmployeeIds.has(e.id));
  const availablePhotos = photos.filter((p) => !p.ignored && !linkedPhotoIds.has(p.id));

  // Count frequencies of each matchKey
  const empKeyCounts = new Map<string, number>();
  for (const emp of employees) {
    empKeyCounts.set(emp.matchKey, (empKeyCounts.get(emp.matchKey) ?? 0) + 1);
  }

  const photoKeyCounts = new Map<string, number>();
  for (const photo of photos.filter((p) => !p.ignored)) {
    photoKeyCounts.set(photo.matchKey, (photoKeyCounts.get(photo.matchKey) ?? 0) + 1);
  }

  let autoLinkedCount = 0;

  // 3. Match only unique single pairs
  for (const emp of availableEmployees) {
    const key = emp.matchKey;
    const isEmpUnique = empKeyCounts.get(key) === 1;
    const isPhotoUnique = photoKeyCounts.get(key) === 1;

    if (isEmpUnique && isPhotoUnique) {
      const matchingPhoto = availablePhotos.find(
        (p) => p.matchKey === key && !linkedPhotoIds.has(p.id),
      );
      if (matchingPhoto) {
        resultLinks.push({
          employeeId: emp.id,
          photoId: matchingPhoto.id,
          mode: "auto",
          revision: 1,
        });
        linkedEmployeeIds.add(emp.id);
        linkedPhotoIds.add(matchingPhoto.id);
        autoLinkedCount += 1;
      }
    }
  }

  return { links: resultLinks, autoLinkedCount };
}
