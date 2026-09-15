import { useMemo, useState, type ChangeEvent } from "react";
import { countIntegratedValidRows, integrateSpreadsheetBatch, type SpreadsheetBatch } from "./batches";
import { parseSpreadsheetFile, type SpreadsheetParseOptions } from "./client";
import {
  SPREADSHEET_LIMITS,
  type SpreadsheetErrorCode,
  type SpreadsheetParseResult,
  type SpreadsheetRowIssueCode,
} from "./types";
import "./spreadsheet.css";

type ParseFile = (file: File, options?: SpreadsheetParseOptions) => Promise<SpreadsheetParseResult>;

export interface SpreadsheetHarnessProps {
  readonly parseFile?: ParseFile;
}

interface SelectedSpreadsheet {
  readonly file: File;
  readonly batchId: string;
}

const FAILURE_MESSAGES: Readonly<Record<SpreadsheetErrorCode, string>> = {
  EMPTY_FILE: "빈 파일은 읽을 수 없습니다.",
  FILE_TOO_LARGE: "XLSX 파일이 5MiB 한도를 초과했습니다.",
  INVALID_EXTENSION: ".xlsx 파일만 선택해 주세요.",
  INVALID_XLSX: "손상됐거나 지원하지 않는 XLSX입니다.",
  UNSAFE_ZIP_ENTRY: "XLSX 내부 경로가 안전하지 않습니다.",
  ZIP_ENTRIES_EXCEEDED: "XLSX 내부 항목이 2,000개 한도를 초과했습니다.",
  ZIP_DECLARED_SIZE_EXCEEDED: "XLSX의 선언된 해제 크기가 50MiB 한도를 초과했습니다.",
  ZIP_ACTUAL_SIZE_EXCEEDED: "XLSX의 실제 해제 크기가 50MiB 한도를 초과했습니다.",
  XLSX_STRUCTURE_MISSING: "필수 XLSX 구조가 없습니다.",
  NO_VISIBLE_SHEET: "표시 상태인 시트가 없습니다.",
  ROWS_EXCEEDED: "데이터가 1,000행 한도를 초과했습니다.",
  MISSING_REQUIRED_HEADER: "이름, 직군, 계약형태 헤더를 각각 하나씩 넣어 주세요.",
  DUPLICATE_REQUIRED_HEADER: "필수 헤더가 중복됐습니다.",
  MERGED_REQUIRED_CELL: "필수 헤더나 데이터 셀의 병합을 해제해 주세요.",
  WORKER_TIMEOUT: "XLSX 처리가 10초를 넘어 Worker를 종료했습니다.",
  WORKER_FAILED: "XLSX Worker를 실행하지 못했습니다.",
  FILE_READ_FAILED: "브라우저가 선택한 파일을 읽지 못했습니다.",
};

const ROW_ISSUE_MESSAGES: Readonly<Record<SpreadsheetRowIssueCode, string>> = {
  REQUIRED_VALUE_MISSING: "필수 값을 입력해 주세요.",
  FORMULA_NOT_ALLOWED: "수식 셀은 사용할 수 없습니다.",
  HYPERLINK_NOT_ALLOWED: "하이퍼링크 셀은 사용할 수 없습니다.",
  NUMBER_NOT_ALLOWED: "숫자 셀은 사용할 수 없습니다.",
  DATE_NOT_ALLOWED: "날짜 셀은 사용할 수 없습니다.",
  BOOLEAN_NOT_ALLOWED: "논리값 셀은 사용할 수 없습니다.",
  CELL_ERROR_NOT_ALLOWED: "오류 셀은 사용할 수 없습니다.",
  UNSUPPORTED_CELL_TYPE: "지원하지 않는 셀 형식입니다.",
  JOB_CATEGORY_NOT_ALLOWED: "허용된 직군을 입력해 주세요.",
  CONTRACT_TYPE_NOT_ALLOWED: "허용된 계약형태를 입력해 주세요.",
};

function createBatchId(): string {
  return `batch-${globalThis.crypto.randomUUID()}`;
}

export function SpreadsheetHarness({ parseFile = parseSpreadsheetFile }: SpreadsheetHarnessProps) {
  const [selection, setSelection] = useState<SelectedSpreadsheet>();
  const [batches, setBatches] = useState<readonly SpreadsheetBatch[]>([]);
  const [latestAttempt, setLatestAttempt] = useState<SpreadsheetParseResult>();
  const [processing, setProcessing] = useState(false);

  const selectedBatch = selection
    ? batches.find((batch) => batch.batchId === selection.batchId)
    : undefined;
  const lastSuccessfulBatch = selectedBatch ?? batches.at(-1);
  const integratedValidRows = useMemo(() => countIntegratedValidRows(batches), [batches]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setSelection(undefined);
      return;
    }
    setSelection({ file, batchId: createBatchId() });
    setLatestAttempt(undefined);
  };

  const runParse = async (technicalDelayMs?: number) => {
    if (!selection || processing) {
      return;
    }

    setProcessing(true);
    try {
      const result = await parseFile(selection.file, {
        batchId: selection.batchId,
        technicalDelayMs,
      });
      setLatestAttempt(result);
      if (result.status === "accepted") {
        setBatches((current) => integrateSpreadsheetBatch(
          current,
          result,
          current.some((batch) => batch.batchId === selection.batchId)
            ? { kind: "retry", batchId: selection.batchId }
            : { kind: "new" },
        ));
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <main className="spreadsheet-harness">
      <header className="spreadsheet-hero">
        <p className="eyebrow">S00.02 · POC-06</p>
        <h1>XLSX 파서 기술 시험</h1>
        <p>
          첫 표시 시트와 안전 한계를 브라우저 Worker에서 검증합니다. 실제 직원 파일을 사용하지 말고
          명시적인 합성 시험 파일만 선택해 주세요.
        </p>
      </header>

      <section className="spreadsheet-panel" aria-labelledby="spreadsheet-input-title">
        <div>
          <p className="section-label">입력</p>
          <h2 id="spreadsheet-input-title">합성 XLSX 선택</h2>
          <p className="spreadsheet-help">
            .xlsx · 최대 5MiB · 데이터 1,000행 · ZIP 해제 50MiB · 엔트리 2,000개
          </p>
        </div>
        <label className="file-control">
          <span>{selection ? "합성 XLSX 선택됨" : "XLSX 파일 선택"}</span>
          <input type="file" accept=".xlsx" onChange={handleFileChange} data-testid="spreadsheet-file" />
        </label>
        <div className="spreadsheet-actions">
          <button type="button" disabled={!selection || processing} onClick={() => void runParse()}>
            {processing ? "Worker 처리 중" : selectedBatch ? "같은 배치 다시 시험" : "파서 시험 실행"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!selection || processing}
            onClick={() => void runParse(SPREADSHEET_LIMITS.workerTimeoutMs + 500)}
          >
            10초 종료 시험
          </button>
        </div>
      </section>

      {latestAttempt?.status === "rejected" && (
        <section className="spreadsheet-alert" role="alert" data-testid="spreadsheet-error">
          <strong>{latestAttempt.error.code}</strong>
          <span>{FAILURE_MESSAGES[latestAttempt.error.code]}</span>
          {lastSuccessfulBatch && <span>이전 정상 배치 결과는 유지했습니다.</span>}
        </section>
      )}

      <section className="spreadsheet-panel" aria-labelledby="spreadsheet-result-title">
        <div className="result-heading">
          <div>
            <p className="section-label">구조화 결과</p>
            <h2 id="spreadsheet-result-title">최근 정상 배치</h2>
          </div>
          <span className="result-total" data-testid="integrated-valid-count">
            누적 정상 {integratedValidRows}행
          </span>
        </div>

        {!lastSuccessfulBatch ? (
          <p className="empty-result">아직 정상적으로 읽은 배치가 없습니다.</p>
        ) : (
          <>
            <dl className="result-grid" data-testid="spreadsheet-summary">
              <div>
                <dt>검사한 행</dt>
                <dd>{lastSuccessfulBatch.result.summary.totalDataRows}</dd>
              </div>
              <div>
                <dt>정상 행</dt>
                <dd>{lastSuccessfulBatch.result.summary.validRows}</dd>
              </div>
              <div>
                <dt>오류 행</dt>
                <dd>{lastSuccessfulBatch.result.summary.invalidRows}</dd>
              </div>
              <div>
                <dt>빈 행 제외</dt>
                <dd>{lastSuccessfulBatch.result.summary.ignoredEmptyRows}</dd>
              </div>
            </dl>

            {lastSuccessfulBatch.result.invalidRows.length > 0 && (
              <div className="issue-list-wrap">
                <h3>수정할 위치</h3>
                <ul className="issue-list">
                  {lastSuccessfulBatch.result.invalidRows.slice(0, 20).map((issue, index) => (
                    <li key={`${issue.sourceRow}-${issue.column}-${issue.code}-${index}`}>
                      <strong>{issue.sourceRow}행 · {issue.column}</strong>
                      <span>{issue.code} · {ROW_ISSUE_MESSAGES[issue.code]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
