import { Unzip, UnzipInflate } from "fflate";
import { SPREADSHEET_LIMITS, type SpreadsheetErrorCode } from "./types";

export interface ZipInspectionLimits {
  readonly maxEntries: number;
  readonly maxUncompressedBytes: number;
}

export interface ZipInspection {
  readonly entries: number;
  readonly declaredUncompressedBytes: number | null;
  readonly actualUncompressedBytes: number;
}

export class SpreadsheetGuardError extends Error {
  readonly code: SpreadsheetErrorCode;

  constructor(code: SpreadsheetErrorCode, detail?: string) {
    super(detail ?? code);
    this.name = "SpreadsheetGuardError";
    this.code = code;
  }
}

const DEFAULT_LIMITS: ZipInspectionLimits = {
  maxEntries: SPREADSHEET_LIMITS.maxZipEntries,
  maxUncompressedBytes: SPREADSHEET_LIMITS.maxUncompressedBytes,
};

const REQUIRED_XLSX_ENTRIES = ["[Content_Types].xml", "xl/workbook.xml"] as const;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

function isZipSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function isSafeArchivePath(name: string): boolean {
  if (name.length === 0 || name.startsWith("/") || name.includes("\\") || name.includes("\0")) {
    return false;
  }

  return !name.split("/").some((segment) => segment === "." || segment === "..");
}

function readEndOfCentralDirectory(bytes: Uint8Array): { readonly entries: number } {
  const minimumRecordBytes = 22;
  const maximumCommentBytes = 65_535;
  const searchStart = Math.max(0, bytes.length - minimumRecordBytes - maximumCommentBytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let offset = bytes.length - minimumRecordBytes; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) !== END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      continue;
    }

    const diskNumber = view.getUint16(offset + 4, true);
    const centralDirectoryDisk = view.getUint16(offset + 6, true);
    const diskEntries = view.getUint16(offset + 8, true);
    const totalEntries = view.getUint16(offset + 10, true);
    const centralDirectoryBytes = view.getUint32(offset + 12, true);
    const centralDirectoryOffset = view.getUint32(offset + 16, true);
    const commentBytes = view.getUint16(offset + 20, true);

    if (
      diskNumber !== 0 ||
      centralDirectoryDisk !== 0 ||
      diskEntries !== totalEntries ||
      totalEntries === 0xffff ||
      centralDirectoryBytes === 0xffffffff ||
      centralDirectoryOffset === 0xffffffff ||
      offset + minimumRecordBytes + commentBytes !== bytes.length ||
      centralDirectoryOffset + centralDirectoryBytes !== offset
    ) {
      throw new SpreadsheetGuardError("INVALID_XLSX", "지원하지 않거나 일관되지 않은 ZIP 중앙 디렉터리입니다.");
    }

    return { entries: totalEntries };
  }

  throw new SpreadsheetGuardError("INVALID_XLSX", "ZIP 중앙 디렉터리 종료 레코드가 없습니다.");
}

export function inspectXlsxZip(
  bytes: Uint8Array,
  limits: ZipInspectionLimits = DEFAULT_LIMITS,
): ZipInspection {
  if (!isZipSignature(bytes)) {
    throw new SpreadsheetGuardError("INVALID_XLSX", "ZIP 기반 XLSX 시그니처가 없습니다.");
  }

  const centralDirectory = readEndOfCentralDirectory(bytes);

  let entries = 0;
  let declaredUncompressedBytes = 0;
  let hasUnknownDeclaredSize = false;
  let actualUncompressedBytes = 0;
  let finalizedEntries = 0;
  let failure: SpreadsheetGuardError | undefined;
  const discoveredEntries = new Set<string>();

  const unzipper = new Unzip((file) => {
    if (failure) {
      file.ondata = () => undefined;
      return;
    }

    entries += 1;
    if (entries > limits.maxEntries) {
      failure = new SpreadsheetGuardError(
        "ZIP_ENTRIES_EXCEEDED",
        `ZIP 엔트리 ${limits.maxEntries.toLocaleString("en-US")}개 한도를 초과했습니다.`,
      );
      file.ondata = () => undefined;
      return;
    }

    if (!isSafeArchivePath(file.name)) {
      failure = new SpreadsheetGuardError("UNSAFE_ZIP_ENTRY", "안전하지 않은 ZIP 엔트리 경로가 있습니다.");
      file.ondata = () => undefined;
      return;
    }

    if (discoveredEntries.has(file.name)) {
      failure = new SpreadsheetGuardError("INVALID_XLSX", "ZIP 엔트리 경로가 중복됩니다.");
      file.ondata = () => undefined;
      return;
    }
    discoveredEntries.add(file.name);
    if (file.originalSize === undefined) {
      hasUnknownDeclaredSize = true;
    } else {
      declaredUncompressedBytes += file.originalSize;
      if (declaredUncompressedBytes > limits.maxUncompressedBytes) {
        failure = new SpreadsheetGuardError(
          "ZIP_DECLARED_SIZE_EXCEEDED",
          `ZIP 선언 해제 크기가 ${limits.maxUncompressedBytes.toLocaleString("en-US")}바이트 한도를 초과했습니다.`,
        );
        file.ondata = () => undefined;
        return;
      }
    }

    file.ondata = (error, chunk, final) => {
      if (failure) {
        return;
      }
      if (error) {
        failure = new SpreadsheetGuardError("INVALID_XLSX", "ZIP 엔트리를 해제할 수 없습니다.");
        return;
      }

      actualUncompressedBytes += chunk.length;
      if (actualUncompressedBytes > limits.maxUncompressedBytes) {
        failure = new SpreadsheetGuardError(
          "ZIP_ACTUAL_SIZE_EXCEEDED",
          `ZIP 실제 해제 크기가 ${limits.maxUncompressedBytes.toLocaleString("en-US")}바이트 한도를 초과했습니다.`,
        );
        file.terminate();
        return;
      }
      if (final) {
        finalizedEntries += 1;
      }
    };

    try {
      file.start();
    } catch {
      failure = new SpreadsheetGuardError("INVALID_XLSX", "지원하지 않는 ZIP 압축이거나 ZIP이 손상됐습니다.");
    }
  });

  unzipper.register(UnzipInflate);

  try {
    const inputChunkBytes = 1_024;
    for (let offset = 0; offset < bytes.length && !failure; offset += inputChunkBytes) {
      const end = Math.min(bytes.length, offset + inputChunkBytes);
      unzipper.push(bytes.subarray(offset, end), end === bytes.length);
    }
  } catch {
    if (!failure) {
      failure = new SpreadsheetGuardError("INVALID_XLSX", "ZIP 구조를 끝까지 읽을 수 없습니다.");
    }
  }

  if (failure) {
    throw failure;
  }

  if (finalizedEntries !== entries) {
    throw new SpreadsheetGuardError("INVALID_XLSX", "끝까지 해제되지 않은 ZIP 엔트리가 있습니다.");
  }

  if (centralDirectory.entries !== entries) {
    throw new SpreadsheetGuardError("INVALID_XLSX", "ZIP 엔트리 수가 중앙 디렉터리와 일치하지 않습니다.");
  }

  if (!REQUIRED_XLSX_ENTRIES.every((entry) => discoveredEntries.has(entry))) {
    throw new SpreadsheetGuardError("XLSX_STRUCTURE_MISSING", "필수 XLSX 구조가 없습니다.");
  }

  return {
    entries,
    declaredUncompressedBytes: hasUnknownDeclaredSize ? null : declaredUncompressedBytes,
    actualUncompressedBytes,
  };
}
