import React, { useRef, useState } from "react";
import { processPhotosBatch } from "../services/photoStorage";
import { createSyntheticPortrait } from "../services/syntheticData";
import { useSession } from "../state/sessionContext";
import type { Employee } from "../types";

export function Step2Matching() {
  const {
    state,
    setStep,
    addPhotos,
    removePhoto,
    toggleIgnorePhoto,
    ignoreAllLeftoverPhotos,
    linkPhoto,
    unlinkPhoto,
    replaceLink,
    summaryCounts,
    canProceedToStep3,
  } = useSession();

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [uploadErrors, setUploadErrors] = useState<readonly { fileName: string; reason: string }[]>([]);

  // Manual connect modal state
  const [manualConnectTargetEmp, setManualConnectTargetEmp] = useState<Employee | null>(null);
  const [selectedPhotoIdForConnect, setSelectedPhotoIdForConnect] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Group photos into linked and unlinked
  const linkedPhotoIdMap = new Map<string, string>(); // photoId -> employeeId
  const linkedEmpIdMap = new Map<string, string>(); // employeeId -> photoId
  for (const link of state.links) {
    linkedPhotoIdMap.set(link.photoId, link.employeeId);
    linkedEmpIdMap.set(link.employeeId, link.photoId);
  }

  const unlinkedPhotos = state.photos.filter((p) => !linkedPhotoIdMap.has(p.id) && !p.ignored);

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setUploadErrors([]);
    setProgress({ completed: 0, total: files.length });

    try {
      const fileList = Array.from(files);
      const result = await processPhotosBatch(fileList, 2, (completed, total) => {
        setProgress({ completed, total });
      });

      if (result.successful.length > 0) {
        addPhotos(result.successful);
      }
      if (result.errors.length > 0) {
        setUploadErrors(result.errors);
      }
    } catch (err) {
      setUploadErrors([
        {
          fileName: "일괄 처리",
          reason: err instanceof Error ? err.message : "사진 처리 중 오류가 발생했습니다.",
        },
      ]);
    } finally {
      setIsProcessing(false);
      setProgress(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFilesSelected(e.dataTransfer.files);
  };

  const handleGenerateSyntheticPhotos = async () => {
    setIsProcessing(true);
    setProgress({ completed: 0, total: state.employees.length });

    try {
      const generatedFiles: File[] = [];
      for (let i = 0; i < state.employees.length; i++) {
        const emp = state.employees[i];
        if (!emp) continue;
        const colors = ["#FFE8D6", "#D8E2DC", "#ECE4DB", "#E8E8E4", "#FCD5CE", "#E2ECE9", "#DFE7FD"];
        const bg = colors[i % colors.length];
        const portrait = await createSyntheticPortrait(emp.name, bg);
        generatedFiles.push(portrait.file);
        setProgress({ completed: i + 1, total: state.employees.length });
      }

      const result = await processPhotosBatch(generatedFiles, 2);
      if (result.successful.length > 0) {
        addPhotos(result.successful);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const handleOpenManualConnect = (emp: Employee) => {
    setManualConnectTargetEmp(emp);
    const available = unlinkedPhotos[0];
    setSelectedPhotoIdForConnect(available ? available.id : "");
  };

  const handleConfirmManualConnect = () => {
    if (!manualConnectTargetEmp || !selectedPhotoIdForConnect) return;

    const existingPhotoId = linkedEmpIdMap.get(manualConnectTargetEmp.id);
    if (existingPhotoId) {
      replaceLink(manualConnectTargetEmp.id, selectedPhotoIdForConnect);
    } else {
      linkPhoto(manualConnectTargetEmp.id, selectedPhotoIdForConnect);
    }

    setManualConnectTargetEmp(null);
    setSelectedPhotoIdForConnect("");
  };

  return (
    <div className="step-container step2-matching">
      <div className="step-intro">
        <h2>2단계: 사진 업로드 및 이름 매칭</h2>
        <p className="step-desc">
          JPG 또는 PNG 사진을 업로드하면 파일명과 직원 이름을 비교해 자동으로 일대일 연결합니다.
          동명이인이거나 파일명이 다른 사진은 수동으로 연결할 수 있습니다.
        </p>
      </div>

      {/* Upload Drop Zone */}
      <div
        className="photo-drop-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="drop-zone-content">
          <span className="drop-icon" aria-hidden="true">🖼️</span>
          <h3>사진 파일들을 끌어다 놓거나 선택하세요</h3>
          <p className="drop-help">
            JPG, JPEG, PNG 지원 (EXIF 방향 자동 보정 · 최대 20MB)
            <br />
            파일명이 직원 이름과 같으면(예: <code>김현정.jpg</code>) 자동으로 연결됩니다.
          </p>
          <div className="drop-actions">
            <label className="btn btn-primary file-label">
              사진 파일 선택
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png"
                onChange={(e) => void handleFilesSelected(e.target.files)}
                disabled={isProcessing}
                style={{ display: "none" }}
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void handleGenerateSyntheticPhotos()}
              disabled={isProcessing || state.employees.length === 0}
              title="등록된 직원들의 이름으로 합성 사진을 자동 생성합니다."
            >
              🧪 합성 사진 자동 생성
            </button>
          </div>
        </div>
      </div>

      {/* Upload Progress Bar */}
      {isProcessing && progress && (
        <div className="alert alert-info">
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{
                width: `${Math.round((progress.completed / Math.max(1, progress.total)) * 100)}%`,
              }}
            />
          </div>
          <span className="small">
            사진 방향 보정 및 분석 중 ({progress.completed} / {progress.total}장 완료)...
          </span>
        </div>
      )}

      {/* Upload Errors */}
      {uploadErrors.length > 0 && (
        <div className="alert alert-danger">
          <strong>업로드 오류 ({uploadErrors.length}건):</strong>
          <ul className="mb-0 mt-1 pl-4">
            {uploadErrors.map((err, idx) => (
              <li key={idx}>
                {err.fileName}: {err.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Matching Stats Banner */}
      <div className="matching-summary-banner">
        <div className="match-stat">
          <span className="label">연결 완료:</span>
          <strong className="text-success">
            {summaryCounts.matchedCount} / {state.employees.length}명
          </strong>
        </div>
        <div className="match-stat">
          <span className="label">미연결 직원:</span>
          <strong className={summaryCounts.unmatchedEmployeesCount > 0 ? "text-amber" : "text-success"}>
            {summaryCounts.unmatchedEmployeesCount}명
          </strong>
        </div>
        <div className="match-stat">
          <span className="label">미연결 사진:</span>
          <strong>{unlinkedPhotos.length}장</strong>
        </div>
        {unlinkedPhotos.length > 0 && summaryCounts.unmatchedEmployeesCount === 0 && (
          <div className="leftover-action">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={ignoreAllLeftoverPhotos}
            >
              남는 사진 {unlinkedPhotos.length}장 모두 무시하기
            </button>
          </div>
        )}
      </div>

      {/* Main Matching Grid: Employees vs Photos */}
      <div className="matching-split-grid">
        {/* Left: Employees */}
        <div className="matching-column employees-col">
          <div className="column-header">
            <h3>직원 목록 및 연결 상태</h3>
            <span className="badge badge-neutral">{state.employees.length}명</span>
          </div>

          <div className="matching-list">
            {state.employees.map((emp) => {
              const linkedPhotoId = linkedEmpIdMap.get(emp.id);
              const linkedPhoto = state.photos.find((p) => p.id === linkedPhotoId);
              const link = state.links.find((l) => l.employeeId === emp.id);

              return (
                <div key={emp.id} className={`matching-card ${linkedPhoto ? "is-linked" : "is-unlinked"}`}>
                  <div className="card-thumb">
                    {linkedPhoto ? (
                      <img
                        src={linkedPhoto.objectUrl}
                        alt={emp.name}
                        className="thumb-img"
                      />
                    ) : (
                      <div className="thumb-placeholder">사진 없음</div>
                    )}
                  </div>

                  <div className="card-info">
                    <div className="name-line">
                      <span className="order-tag">#{emp.order}</span>
                      <strong>{emp.name}</strong>
                      <span className={`chip-pill chip-${emp.jobCategory}`}>
                        {emp.jobCategory}
                      </span>
                    </div>
                    <div className="sub-info">
                      <span className="contract-tag">{emp.contractType}</span>
                      {linkedPhoto && (
                        <span className="photo-tag" title={linkedPhoto.fileName}>
                          📎 {linkedPhoto.fileName} ({link?.mode === "auto" ? "자동" : "수동"})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="card-actions">
                    {linkedPhoto ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => unlinkPhoto(emp.id)}
                      >
                        연결 해제
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => handleOpenManualConnect(emp)}
                        disabled={unlinkedPhotos.length === 0}
                      >
                        사진 연결
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Photos */}
        <div className="matching-column photos-col">
          <div className="column-header">
            <h3>업로드된 사진 ({state.photos.length}장)</h3>
            <span className="badge badge-neutral">
              미연결: {unlinkedPhotos.length}장
            </span>
          </div>

          {state.photos.length === 0 ? (
            <div className="empty-state">
              <p>업로드된 사진이 없습니다.</p>
              <p className="empty-sub">위 영역에 사진 파일들을 추가해 주세요.</p>
            </div>
          ) : (
            <div className="photos-gallery">
              {state.photos.map((photo) => {
                const linkedEmpId = linkedPhotoIdMap.get(photo.id);
                const linkedEmp = state.employees.find((e) => e.id === linkedEmpId);

                return (
                  <div
                    key={photo.id}
                    className={`gallery-card ${photo.ignored ? "is-ignored" : linkedEmp ? "is-assigned" : "is-available"}`}
                  >
                    <div className="photo-thumb-container">
                      <img src={photo.objectUrl} alt={photo.fileName} className="gallery-thumb" />
                      {photo.ignored && <span className="ignored-overlay">무시됨</span>}
                    </div>

                    <div className="photo-meta">
                      <span className="photo-name" title={photo.fileName}>
                        {photo.fileName}
                      </span>
                      <span className="photo-size">
                        {photo.width} × {photo.height}px
                      </span>
                      {linkedEmp ? (
                        <span className="badge badge-success small">
                          ✓ {linkedEmp.name}에게 연결됨
                        </span>
                      ) : photo.ignored ? (
                        <span className="badge badge-neutral small">무시 대상</span>
                      ) : (
                        <span className="badge badge-warning small">미연결</span>
                      )}
                    </div>

                    <div className="photo-actions">
                      <button
                        type="button"
                        className="btn btn-xs btn-outline-secondary"
                        onClick={() => toggleIgnorePhoto(photo.id)}
                        title={photo.ignored ? "무시를 해제하고 다시 매칭 대상으로 사용합니다." : "이 사진을 무시합니다."}
                      >
                        {photo.ignored ? "무시 해제" : "무시"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-outline-danger"
                        onClick={() => removePhoto(photo.id)}
                        title="사진을 삭제합니다."
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Manual Connect Modal */}
      {manualConnectTargetEmp && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="connect-modal-title">
          <div className="modal-content connect-modal">
            <div className="modal-header">
              <h3 id="connect-modal-title">
                '{manualConnectTargetEmp.name}' 직원에게 사진 연결
              </h3>
            </div>
            <div className="modal-body">
              {unlinkedPhotos.length === 0 ? (
                <p>연결 가능한 미연결 사진이 없습니다. 먼저 사진을 업로드해 주세요.</p>
              ) : (
                <div className="photo-selection-grid">
                  {unlinkedPhotos.map((p) => {
                    const isSelected = p.id === selectedPhotoIdForConnect;
                    return (
                      <div
                        key={p.id}
                        className={`selectable-photo-item ${isSelected ? "selected" : ""}`}
                        onClick={() => setSelectedPhotoIdForConnect(p.id)}
                      >
                        <img src={p.objectUrl} alt={p.fileName} className="selectable-thumb" />
                        <span className="selectable-name">{p.fileName}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setManualConnectTargetEmp(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!selectedPhotoIdForConnect}
                onClick={handleConfirmManualConnect}
              >
                선택한 사진 연결
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step Bottom Navigation */}
      <div className="step-bottom-nav">
        <button
          type="button"
          className="btn btn-secondary btn-lg"
          onClick={() => setStep(1)}
        >
          &lt; 이전 단계: 직원 정보
        </button>

        <div className="nav-help">
          {!canProceedToStep3 && (
            <span className="text-amber">
              {summaryCounts.unmatchedEmployeesCount > 0
                ? `* 아직 사진이 연결되지 않은 직원이 ${summaryCounts.unmatchedEmployeesCount}명 있습니다.`
                : unlinkedPhotos.length > 0
                  ? `* 남는 사진(${unlinkedPhotos.length}장)을 무시하거나 삭제해 주세요.`
                  : "* 모든 직원에게 사진을 연결해 주세요."}
            </span>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!canProceedToStep3}
          onClick={() => setStep(3)}
        >
          다음 단계: 사진 편집 &gt;
        </button>
      </div>
    </div>
  );
}
