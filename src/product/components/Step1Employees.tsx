import React, { useState } from "react";
import { parseSpreadsheetFile } from "../../technical/spreadsheet/client";
import type {
  SpreadsheetAcceptedResult,
  SpreadsheetRowIssue,
} from "../../technical/spreadsheet/types";
import { downloadXlsxTemplate } from "../services/xlsxTemplate";
import { useSession } from "../state/sessionContext";
import {
  CONTRACT_TYPES,
  JOB_CATEGORIES,
  type ContractType,
  type Employee,
  type JobCategory,
} from "../types";

export function Step1Employees() {
  const {
    state,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    importEmployees,
    loadSyntheticSample,
    setStep,
    canProceedToStep2,
  } = useSession();

  // Direct addition form state
  const [nameInput, setNameInput] = useState("");
  const [jobInput, setJobInput] = useState<JobCategory>("개발(CE)");
  const [contractInput, setContractInput] = useState<ContractType>("정규직");
  const [inputError, setInputError] = useState<string | null>(null);

  // Edit employee state
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editJob, setEditJob] = useState<JobCategory>("개발(CE)");
  const [editContract, setEditContract] = useState<ContractType>("정규직");

  // XLSX Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [xlsxFileError, setXlsxFileError] = useState<string | null>(null);
  const [pendingBatchResult, setPendingBatchResult] = useState<SpreadsheetAcceptedResult | null>(
    null,
  );
  const [editableInvalidRows, setEditableInvalidRows] = useState<
    {
      sourceRow: number;
      name: string;
      jobCategory: JobCategory;
      contractType: ContractType;
      issues: SpreadsheetRowIssue[];
    }[]
  >([]);

  // Homonym check
  const empKeyCounts = new Map<string, number>();
  for (const emp of state.employees) {
    empKeyCounts.set(emp.matchKey, (empKeyCounts.get(emp.matchKey) ?? 0) + 1);
  }

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = nameInput.trim().replace(/\s+/gu, " ");
    if (!clean) {
      setInputError("이름을 입력해 주세요.");
      return;
    }
    addEmployee(clean, jobInput, contractInput);
    setNameInput("");
    setInputError(null);
  };

  const handleStartEdit = (emp: Employee) => {
    setEditingEmployeeId(emp.id);
    setEditName(emp.name);
    setEditJob(emp.jobCategory);
    setEditContract(emp.contractType);
  };

  const handleSaveEdit = () => {
    if (!editingEmployeeId) return;
    const clean = editName.trim().replace(/\s+/gu, " ");
    if (!clean) return;

    updateEmployee(editingEmployeeId, clean, editJob, editContract);
    setEditingEmployeeId(null);
  };

  const handleCancelEdit = () => {
    setEditingEmployeeId(null);
  };

  const handleXlsxFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file) return;

    setIsUploading(true);
    setXlsxFileError(null);

    try {
      const result = await parseSpreadsheetFile(file);
      if (result.status === "rejected") {
        setXlsxFileError(result.error.detail ?? "XLSX 파일을 읽지 못했습니다.");
        setPendingBatchResult(null);
      } else {
        setPendingBatchResult(result);
        // Map invalid rows to editable state
        const invalidRowMap = new Map<number, SpreadsheetRowIssue[]>();
        for (const issue of result.invalidRows) {
          const list = invalidRowMap.get(issue.sourceRow) ?? [];
          list.push(issue);
          invalidRowMap.set(issue.sourceRow, list);
        }

        const initialEditable = Array.from(invalidRowMap.entries()).map(
          ([sourceRow, issues]) => ({
            sourceRow,
            name: "",
            jobCategory: "개발(CE)" as JobCategory,
            contractType: "정규직" as ContractType,
            issues,
          }),
        );
        setEditableInvalidRows(initialEditable);
      }
    } catch (err) {
      setXlsxFileError(err instanceof Error ? err.message : "XLSX 처리 오류가 발생했습니다.");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleApplyImport = () => {
    if (!pendingBatchResult) return;

    // Combine valid rows with any user-fixed rows that have a valid name
    const allToImport: {
      name: string;
      jobCategory: JobCategory;
      contractType: ContractType;
    }[] = pendingBatchResult.validRows.map((r) => ({
      name: r.name,
      jobCategory: r.jobCategory,
      contractType: r.contractType,
    }));

    for (const fixed of editableInvalidRows) {
      const clean = fixed.name.trim().replace(/\s+/gu, " ");
      if (clean) {
        allToImport.push({
          name: clean,
          jobCategory: fixed.jobCategory,
          contractType: fixed.contractType,
        });
      }
    }

    if (allToImport.length > 0) {
      importEmployees(allToImport);
    }
    setPendingBatchResult(null);
    setEditableInvalidRows([]);
  };

  const handleExcludeInvalidRow = (sourceRow: number) => {
    setEditableInvalidRows((prev) => prev.filter((r) => r.sourceRow !== sourceRow));
  };

  const handleUpdateInvalidRowField = (
    sourceRow: number,
    field: "name" | "jobCategory" | "contractType",
    value: string,
  ) => {
    setEditableInvalidRows((prev) =>
      prev.map((r) => (r.sourceRow === sourceRow ? { ...r, [field]: value } : r)),
    );
  };

  return (
    <div className="step-container step1-employees">
      <div className="step-intro">
        <h2>1단계: 직원 정보 입력</h2>
        <p className="step-desc">
          조직보드에 배치할 신규 입사자의 이름, 직군, 계약형태를 입력합니다.
          직접 입력하거나 XLSX 양식 파일을 업로드하여 일괄 등록할 수 있습니다.
        </p>
      </div>

      <div className="action-toolbar">
        <div className="toolbar-group">
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={() => void downloadXlsxTemplate()}
          >
            📥 XLSX 양식 다운로드
          </button>
          <label className="btn btn-outline-primary file-label">
            📂 XLSX 파일 불러오기
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => void handleXlsxFileChange(e)}
              disabled={isUploading}
              style={{ display: "none" }}
            />
          </label>
        </div>

        <div className="toolbar-group">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={loadSyntheticSample}
            title="가상의 합성 테스트 인물 7명을 불러옵니다."
          >
            🧪 샘플 데이터 불러오기
          </button>
        </div>
      </div>

      {isUploading && (
        <div className="alert alert-info">
          <span>XLSX 문서를 안전하게 분석하는 중입니다...</span>
        </div>
      )}

      {xlsxFileError && (
        <div className="alert alert-danger" role="alert">
          <strong>파일 오류:</strong> {xlsxFileError}
        </div>
      )}

      {/* XLSX Import Preview Modal / Box */}
      {pendingBatchResult && (
        <div className="import-preview-card">
          <div className="preview-header">
            <h3>XLSX 가져오기 검토</h3>
            <span className="badge badge-success">
              정상 데이터: {pendingBatchResult.validRows.length}건
            </span>
            {editableInvalidRows.length > 0 && (
              <span className="badge badge-warning">
                수정/제외 필요: {editableInvalidRows.length}건
              </span>
            )}
          </div>

          {editableInvalidRows.length > 0 && (
            <div className="invalid-rows-section">
              <p className="section-help">
                일부 행에 오류가 있습니다. 정보를 직접 수정하여 함께 추가하거나, [제외]를 눌러 건너뛸 수 있습니다.
              </p>
              <div className="table-responsive">
                <table className="app-table table-sm">
                  <thead>
                    <tr>
                      <th style={{ width: "80px" }}>행 번호</th>
                      <th>발견된 문제</th>
                      <th>이름 수정</th>
                      <th>직군</th>
                      <th>계약형태</th>
                      <th style={{ width: "90px" }}>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editableInvalidRows.map((row) => (
                      <tr key={row.sourceRow}>
                        <td>{row.sourceRow}행</td>
                        <td>
                          {row.issues.map((i, idx) => (
                            <div key={idx} className="error-text small">
                              • {i.column}: {translateIssueCode(i.code)}
                            </div>
                          ))}
                        </td>
                        <td>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="이름 입력"
                            value={row.name}
                            onChange={(e) =>
                              handleUpdateInvalidRowField(row.sourceRow, "name", e.target.value)
                            }
                          />
                        </td>
                        <td>
                          <select
                            className="form-select form-select-sm"
                            value={row.jobCategory}
                            onChange={(e) =>
                              handleUpdateInvalidRowField(
                                row.sourceRow,
                                "jobCategory",
                                e.target.value,
                              )
                            }
                          >
                            {JOB_CATEGORIES.map((j) => (
                              <option key={j} value={j}>
                                {j}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="form-select form-select-sm"
                            value={row.contractType}
                            onChange={(e) =>
                              handleUpdateInvalidRowField(
                                row.sourceRow,
                                "contractType",
                                e.target.value,
                              )
                            }
                          >
                            {CONTRACT_TYPES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => handleExcludeInvalidRow(row.sourceRow)}
                          >
                            제외
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="preview-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setPendingBatchResult(null);
                setEditableInvalidRows([]);
              }}
            >
              취소
            </button>
            <button type="button" className="btn btn-primary" onClick={handleApplyImport}>
              {pendingBatchResult.validRows.length +
                editableInvalidRows.filter((r) => r.name.trim()).length}
              명 목록에 추가
            </button>
          </div>
        </div>
      )}

      {/* Direct Add Form */}
      <div className="card add-employee-card">
        <h3>직원 직접 추가</h3>
        <form className="add-employee-form" onSubmit={handleAddSubmit}>
          <div className="form-group">
            <label htmlFor="emp-name-input">이름</label>
            <input
              id="emp-name-input"
              type="text"
              className="form-control"
              placeholder="예: 김현정"
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                if (inputError) setInputError(null);
              }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="emp-job-select">직군 (컬러칩)</label>
            <select
              id="emp-job-select"
              className="form-select"
              value={jobInput}
              onChange={(e) => setJobInput(e.target.value as JobCategory)}
            >
              {JOB_CATEGORIES.map((job) => (
                <option key={job} value={job}>
                  {job}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="emp-contract-select">계약형태 (우선색)</label>
            <select
              id="emp-contract-select"
              className="form-select"
              value={contractInput}
              onChange={(e) => setContractInput(e.target.value as ContractType)}
            >
              {CONTRACT_TYPES.map((ct) => (
                <option key={ct} value={ct}>
                  {ct}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group form-submit">
            <button type="submit" className="btn btn-primary">
              직원 추가
            </button>
          </div>
        </form>
        {inputError && <p className="error-text mt-2">{inputError}</p>}
      </div>

      {/* Employee List Table */}
      <div className="card employee-list-card">
        <div className="card-header-flex">
          <h3>등록된 직원 목록 ({state.employees.length}명)</h3>
          <span className="order-hint">
            * 목록 순서대로 A4 용지(7열×3행)의 왼쪽에서 오른쪽으로 배치됩니다.
          </span>
        </div>

        {state.employees.length === 0 ? (
          <div className="empty-state">
            <p>아직 등록된 직원이 없습니다.</p>
            <p className="empty-sub">
              위 입력란에서 직원을 직접 추가하거나 XLSX 파일을 불러와 주세요.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="app-table">
              <thead>
                <tr>
                  <th style={{ width: "60px" }}>배치순서</th>
                  <th>이름</th>
                  <th>직군</th>
                  <th>계약형태</th>
                  <th>사진 상태</th>
                  <th style={{ width: "140px" }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {state.employees.map((emp) => {
                  const isEditing = editingEmployeeId === emp.id;
                  const isHomonym = (empKeyCounts.get(emp.matchKey) ?? 0) > 1;
                  const isLinked = state.links.some((l) => l.employeeId === emp.id);

                  if (isEditing) {
                    return (
                      <tr key={emp.id} className="row-editing">
                        <td>{emp.order}</td>
                        <td>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        </td>
                        <td>
                          <select
                            className="form-select form-select-sm"
                            value={editJob}
                            onChange={(e) => setEditJob(e.target.value as JobCategory)}
                          >
                            {JOB_CATEGORIES.map((j) => (
                              <option key={j} value={j}>
                                {j}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="form-select form-select-sm"
                            value={editContract}
                            onChange={(e) => setEditContract(e.target.value as ContractType)}
                          >
                            {CONTRACT_TYPES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>-</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm btn-success mr-1"
                            onClick={handleSaveEdit}
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={handleCancelEdit}
                          >
                            취소
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={emp.id}>
                      <td className="text-center font-mono">#{emp.order}</td>
                      <td>
                        <strong>{emp.name}</strong>
                        {isHomonym && (
                          <span className="badge badge-warning ml-2" title="동명이인은 사진을 자동 연결하지 않고 수동 확인합니다.">
                            동명이인
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`chip-badge chip-${emp.jobCategory}`}>
                          {emp.jobCategory}
                        </span>
                      </td>
                      <td>
                        <span className="contract-label">{emp.contractType}</span>
                      </td>
                      <td>
                        {isLinked ? (
                          <span className="badge badge-success">사진 연결됨</span>
                        ) : (
                          <span className="badge badge-neutral">사진 없음</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary mr-1"
                          onClick={() => handleStartEdit(emp)}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => {
                            if (window.confirm(`'${emp.name}' 직원을 삭제하시겠습니까?`)) {
                              deleteEmployee(emp.id);
                            }
                          }}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="step-bottom-nav">
        <div className="nav-help">
          {!canProceedToStep2 && (
            <span className="text-amber">
              * 다음 단계로 진행하려면 직원을 최소 1명 이상 등록해 주세요.
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!canProceedToStep2}
          onClick={() => setStep(2)}
        >
          다음 단계: 사진 매칭 &gt;
        </button>
      </div>
    </div>
  );
}

function translateIssueCode(code: string): string {
  switch (code) {
    case "REQUIRED_VALUE_MISSING":
      return "필수값이 비어 있습니다.";
    case "JOB_CATEGORY_NOT_ALLOWED":
      return "허용되지 않은 직군 값입니다.";
    case "CONTRACT_TYPE_NOT_ALLOWED":
      return "허용되지 않은 계약형태 값입니다.";
    case "FORMULA_NOT_ALLOWED":
      return "수식 셀은 사용할 수 없습니다.";
    case "NUMBER_NOT_ALLOWED":
      return "텍스트만 허용됩니다 (숫자 감지).";
    case "DATE_NOT_ALLOWED":
      return "텍스트만 허용됩니다 (날짜 감지).";
    case "BOOLEAN_NOT_ALLOWED":
      return "텍스트만 허용됩니다 (참/거짓 감지).";
    default:
      return "올바르지 않은 셀 값입니다.";
  }
}
