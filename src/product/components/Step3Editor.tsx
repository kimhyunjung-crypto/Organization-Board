import React, { useEffect, useMemo, useRef } from "react";
import { renderEditorView } from "../../technical/imaging/canvasRenderer";
import { IMAGING_CONSTANTS } from "../../technical/imaging/types";
import { renderCardToCanvas } from "../../technical/pdf/canvasCardRenderer";
import { computeNameLayout } from "../../technical/pdf/nameLayout";
import { buildCardRenderPlan } from "../../technical/pdf/renderPlan";
import { useSession } from "../state/sessionContext";
import type { EmployeeEdit } from "../types";

export function Step3Editor() {
  const {
    state,
    setStep,
    selectEmployee,
    setEditorFilter,
    updateCrop,
    panCropRelative,
    zoomCropRelative,
    resetToAuto,
    resetToCover,
    confirmIssues,
    confirmLowRes,
    canProceedToStep4,
    blockingIssues,
  } = useSession();

  // If no employee selected, select the first one
  useEffect(() => {
    if (!state.selectedEmployeeId && state.employees.length > 0) {
      const first = state.employees[0];
      if (first) {
        selectEmployee(first.id);
      }
    }
  }, [state.selectedEmployeeId, state.employees, selectEmployee]);

  const currentEmployee = useMemo(() => {
    return (
      state.employees.find((e) => e.id === state.selectedEmployeeId) ??
      state.employees[0] ??
      null
    );
  }, [state.employees, state.selectedEmployeeId]);

  const currentLink = useMemo(() => {
    if (!currentEmployee) return null;
    return state.links.find((l) => l.employeeId === currentEmployee.id) ?? null;
  }, [state.links, currentEmployee]);

  const currentPhoto = useMemo(() => {
    if (!currentLink) return null;
    return state.photos.find((p) => p.id === currentLink.photoId) ?? null;
  }, [state.photos, currentLink]);

  const currentEdit = useMemo<EmployeeEdit | null>(() => {
    if (!currentEmployee) return null;
    return state.edits[currentEmployee.id] ?? null;
  }, [state.edits, currentEmployee]);

  // Canvases
  const editorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Mouse drag panning state
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number } | null>(null);

  // Name layout check for current employee
  const currentNameLayout = useMemo(() => {
    if (!currentEmployee || !state.font) return null;
    return computeNameLayout(currentEmployee.name, state.font);
  }, [currentEmployee, state.font]);

  // Filtered employee list
  const filteredEmployees = useMemo(() => {
    if (state.editorFilter === "all") return state.employees;

    return state.employees.filter((emp) => {
      const edit = state.edits[emp.id];
      if (!edit) return true;
      const hasFaceIssue = edit.issues.length > 0 && !edit.confirmedIssues;
      const isLowRes =
        edit.crop.width < IMAGING_CONSTANTS.MIN_PRINT_WIDTH_PX ||
        edit.crop.height < IMAGING_CONSTANTS.MIN_PRINT_HEIGHT_PX;
      const hasLowResIssue = isLowRes && !edit.confirmedLowRes;
      return hasFaceIssue || hasLowResIssue;
    });
  }, [state.employees, state.edits, state.editorFilter]);

  // Current employee index
  const currentIndex = currentEmployee
    ? state.employees.findIndex((e) => e.id === currentEmployee.id)
    : -1;

  const handlePrevEmployee = () => {
    if (currentIndex > 0) {
      const prev = state.employees[currentIndex - 1];
      if (prev) selectEmployee(prev.id);
    }
  };

  const handleNextEmployee = () => {
    if (currentIndex >= 0 && currentIndex < state.employees.length - 1) {
      const next = state.employees[currentIndex + 1];
      if (next) selectEmployee(next.id);
    }
  };

  // Render Editor Canvas
  useEffect(() => {
    const canvas = editorCanvasRef.current;
    if (!canvas || !currentPhoto || !currentEdit) return;

    // Display scale to fit editor container nicely
    const maxEditorW = 560;
    const maxEditorH = 500;
    const scale = Math.min(
      maxEditorW / currentPhoto.width,
      maxEditorH / currentPhoto.height,
      1.0,
    );

    renderEditorView(
      currentPhoto.canvas,
      currentPhoto.width,
      currentPhoto.height,
      currentEdit.crop,
      currentEdit.faces,
      canvas,
      scale,
    );
  }, [currentPhoto, currentEdit]);

  // Render Live Card Preview Canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !currentEmployee || !currentPhoto || !currentEdit || !state.font) return;

    const plan = buildCardRenderPlan(
      {
        employeeId: currentEmployee.id,
        name: currentEmployee.name,
        jobCategory: currentEmployee.jobCategory,
        contractType: currentEmployee.contractType,
        photoCrop: currentEdit.crop,
        photoRevision: currentEdit.revision,
      },
      currentIndex >= 0 ? currentIndex : 0,
      state.font,
    );

    renderCardToCanvas(plan, canvas, {
      photoSource: currentPhoto.canvas,
      showGuides: true,
      scale: 12.0, // crisp high-res preview scale
    });
  }, [currentEmployee, currentPhoto, currentEdit, state.font, currentIndex]);

  // Drag-to-pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || !dragStartRef.current || !currentEmployee || !currentPhoto || !currentEdit) {
      return;
    }

    const canvas = editorCanvasRef.current;
    if (!canvas) return;

    const dx = e.clientX - dragStartRef.current.mouseX;
    const dy = e.clientY - dragStartRef.current.mouseY;

    // Convert screen px delta to original image space
    const scale = canvas.width / currentPhoto.width;
    // Moving mouse right pans the crop window left (TRD §8)
    const cropDeltaX = -dx / scale;
    const cropDeltaY = -dy / scale;

    const newCropX = Math.max(
      0,
      Math.min(currentPhoto.width - currentEdit.crop.width, currentEdit.crop.x + cropDeltaX),
    );
    const newCropY = Math.max(
      0,
      Math.min(currentPhoto.height - currentEdit.crop.height, currentEdit.crop.y + cropDeltaY),
    );

    updateCrop(currentEmployee.id, {
      ...currentEdit.crop,
      x: newCropX,
      y: newCropY,
    });

    dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    dragStartRef.current = null;
  };

  // Keyboard arrow keys fine pan (0.5% standard, 2.5% with Shift per TRD §8)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!currentEmployee || !currentEdit) return;

    const stepRatio = e.shiftKey
      ? IMAGING_CONSTANTS.PAN_SHIFT_STEP_RATIO
      : IMAGING_CONSTANTS.PAN_STEP_RATIO;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        panCropRelative(currentEmployee.id, 0, -stepRatio);
        break;
      case "ArrowDown":
        e.preventDefault();
        panCropRelative(currentEmployee.id, 0, stepRatio);
        break;
      case "ArrowLeft":
        e.preventDefault();
        panCropRelative(currentEmployee.id, -stepRatio, 0);
        break;
      case "ArrowRight":
        e.preventDefault();
        panCropRelative(currentEmployee.id, stepRatio, 0);
        break;
    }
  };

  // Check low resolution
  const isCurrentLowRes = currentEdit
    ? currentEdit.crop.width < IMAGING_CONSTANTS.MIN_PRINT_WIDTH_PX ||
      currentEdit.crop.height < IMAGING_CONSTANTS.MIN_PRINT_HEIGHT_PX
    : false;

  const hasFaceWarning =
    currentEdit && currentEdit.issues.length > 0 && !currentEdit.confirmedIssues;

  return (
    <div className="step-container step3-editor">
      <div className="step-intro">
        <h2>3단계: 사진 편집 및 자르기</h2>
        <p className="step-desc">
          얼굴 위치를 감지하여 최적의 구도로 자동 편집되었습니다.
          필요한 사진을 드래그하거나 확대/축소하여 미세 조정하고, 확인 필요 항목을 검토해 주세요.
        </p>
      </div>

      <div className="editor-main-layout">
        {/* Left: Employee Selection Sidebar */}
        <aside className="editor-sidebar">
          <div className="filter-tabs">
            <button
              type="button"
              className={`filter-btn ${state.editorFilter === "all" ? "active" : ""}`}
              onClick={() => setEditorFilter("all")}
            >
              전체 ({state.employees.length})
            </button>
            <button
              type="button"
              className={`filter-btn ${state.editorFilter === "needsReview" ? "active" : ""}`}
              onClick={() => setEditorFilter("needsReview")}
            >
              확인 필요
            </button>
          </div>

          <div className="employee-nav-list">
            {filteredEmployees.map((emp) => {
              const isSelected = emp.id === currentEmployee?.id;
              const link = state.links.find((l) => l.employeeId === emp.id);
              const photo = link ? state.photos.find((p) => p.id === link.photoId) : null;
              const edit = state.edits[emp.id];

              const needsReview =
                (edit && edit.issues.length > 0 && !edit.confirmedIssues) ||
                (edit &&
                  (edit.crop.width < IMAGING_CONSTANTS.MIN_PRINT_WIDTH_PX ||
                    edit.crop.height < IMAGING_CONSTANTS.MIN_PRINT_HEIGHT_PX) &&
                  !edit.confirmedLowRes);

              return (
                <button
                  type="button"
                  key={emp.id}
                  className={`emp-nav-item ${isSelected ? "selected" : ""}`}
                  onClick={() => selectEmployee(emp.id)}
                >
                  <div className="nav-thumb-box">
                    {photo ? (
                      <img src={photo.objectUrl} alt={emp.name} className="nav-thumb-img" />
                    ) : (
                      <div className="nav-thumb-empty">?</div>
                    )}
                  </div>

                  <div className="nav-info">
                    <div className="nav-name-row">
                      <span className="order-num">#{emp.order}</span>
                      <strong>{emp.name}</strong>
                    </div>
                    <span className={`chip-micro chip-${emp.jobCategory}`}>
                      {emp.jobCategory}
                    </span>
                  </div>

                  <div className="nav-status-icon">
                    {needsReview ? (
                      <span className="badge-dot warning" title="확인이 필요합니다." />
                    ) : edit?.manuallyEdited ? (
                      <span className="badge-dot manual" title="수동 조정됨" />
                    ) : (
                      <span className="badge-dot success" title="자동 편집 완료" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center: Interactive Crop Editor */}
        <section className="editor-workspace">
          {currentEmployee && currentPhoto && currentEdit ? (
            <div className="workspace-inner">
              {/* Header with Navigation */}
              <div className="workspace-header">
                <div className="employee-title-group">
                  <span className="order-badge">#{currentEmployee.order}</span>
                  <h3>{currentEmployee.name}</h3>
                  <span className={`chip-badge chip-${currentEmployee.jobCategory}`}>
                    {currentEmployee.jobCategory}
                  </span>
                  <span className="contract-pill">{currentEmployee.contractType}</span>
                </div>

                <div className="prev-next-nav">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={handlePrevEmployee}
                    disabled={currentIndex <= 0}
                  >
                    &lt; 이전 직원
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={handleNextEmployee}
                    disabled={currentIndex >= state.employees.length - 1}
                  >
                    다음 직원 &gt;
                  </button>
                </div>
              </div>

              {/* Warning Banners */}
              {hasFaceWarning && (
                <div className="alert alert-warning banner-warning">
                  <div className="banner-content">
                    <span className="warning-icon" aria-hidden="true">⚠️</span>
                    <div>
                      <strong>사진 위치 확인 필요:</strong>
                      <p className="mb-0">
                        {currentEdit.issues.map((i) => i.message).join(" ")}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-success confirm-btn"
                    onClick={() => confirmIssues(currentEmployee.id)}
                  >
                    ✓ 이 사진 사용
                  </button>
                </div>
              )}

              {isCurrentLowRes && !currentEdit.confirmedLowRes && (
                <div className="alert alert-warning banner-warning">
                  <div className="banner-content">
                    <span className="warning-icon" aria-hidden="true">⚠️</span>
                    <div>
                      <strong>저해상도 경고:</strong>
                      <p className="mb-0">
                        크롭 영역({Math.round(currentEdit.crop.width)} ×{" "}
                        {Math.round(currentEdit.crop.height)}px)이 300ppi 권장 해상도(265 × 311px)
                        미만입니다. 인쇄 시 다소 흐릴 수 있습니다.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-warning confirm-btn"
                    onClick={() => confirmLowRes(currentEmployee.id)}
                  >
                    ✓ 저해상도 인쇄 확인
                  </button>
                </div>
              )}

              {/* Interactive Canvas */}
              <div className="canvas-wrapper">
                <canvas
                  ref={editorCanvasRef}
                  className="interactive-editor-canvas"
                  tabIndex={0}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onKeyDown={handleKeyDown}
                  title="마우스로 드래그하거나 방향키(Shift 병용)로 위치를 미세 조정하세요."
                />
                <span className="canvas-hint">
                  💡 마우스 드래그로 이동 · 프레임 클릭 후 방향키(0.5%) 또는 Shift+방향키(2.5%) 미세 이동
                </span>
              </div>

              {/* Controls: Zoom & Resets */}
              <div className="editor-controls-bar">
                <div className="zoom-group">
                  <span className="control-label">확대/축소:</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() =>
                      zoomCropRelative(
                        currentEmployee.id,
                        Math.max(1.0, currentEdit.zoom - 0.2),
                      )
                    }
                    disabled={currentEdit.zoom <= 1.0}
                  >
                    -
                  </button>
                  <input
                    type="range"
                    min="1.0"
                    max="5.0"
                    step="0.05"
                    className="form-range zoom-slider"
                    value={currentEdit.zoom}
                    onChange={(e) =>
                      zoomCropRelative(currentEmployee.id, parseFloat(e.target.value))
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() =>
                      zoomCropRelative(
                        currentEmployee.id,
                        Math.min(5.0, currentEdit.zoom + 0.2),
                      )
                    }
                    disabled={currentEdit.zoom >= 5.0}
                  >
                    +
                  </button>
                  <span className="zoom-value">{currentEdit.zoom.toFixed(1)}x</span>
                </div>

                <div className="reset-group">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => resetToAuto(currentEmployee.id)}
                    title="자동 얼굴 검출 결과로 되돌립니다."
                  >
                    자동 편집으로 초기화
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => resetToCover(currentEmployee.id)}
                    title="사진 중앙 기준 1.0x 구도로 초기화합니다."
                  >
                    원본 기준으로 초기화
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p>선택된 직원이 없습니다.</p>
            </div>
          )}
        </section>

        {/* Right: Live Card Preview & Glyph Errors */}
        <aside className="card-preview-panel">
          <div className="preview-panel-header">
            <h4>조직보드 카드 실시간 미리보기</h4>
            <span className="card-spec-note">25 × 38 mm 실제 규격</span>
          </div>

          <div className="card-canvas-container">
            <canvas ref={previewCanvasRef} className="card-preview-canvas" />
          </div>

          {/* Name & Font Validation Box */}
          <div className="name-validation-card">
            <h5>이름 출력 검증</h5>
            {currentNameLayout ? (
              currentNameLayout.fits ? (
                <div className="validation-success">
                  <span className="badge badge-success">✓ 출력 적합</span>
                  <p className="validation-detail">
                    {currentNameLayout.fontSize}pt · {currentNameLayout.lines.length}줄 표시
                  </p>
                </div>
              ) : currentNameLayout.error === "MISSING_GLYPH" ? (
                <div className="alert alert-danger p-2 mb-0">
                  <strong>⚠️ 글꼴 미지원 문자 발견:</strong>
                  <p className="small mb-0 mt-1">
                    현재 나눔고딕 글꼴에 포함되지 않은 문자(
                    <code>{currentNameLayout.missingGlyphs?.join(", ")}</code>)가 있습니다.
                    일본어 등 미지원 문자는 PDF 출력이 차단되므로 1단계에서 이름을 수정해 주세요.
                  </p>
                </div>
              ) : currentNameLayout.error === "NAME_OVERFLOW" ? (
                <div className="alert alert-danger p-2 mb-0">
                  <strong>⚠️ 이름 영역 초과:</strong>
                  <p className="small mb-0 mt-1">
                    이름이 카드 이름 영역(최소 9pt 2줄)을 초과하여 출력할 수 없습니다. 이름을 축약해 주세요.
                  </p>
                </div>
              ) : (
                <div className="alert alert-danger p-2 mb-0">
                  <strong>⚠️ 이름 오류:</strong>
                  <p className="small mb-0 mt-1">{currentNameLayout.errorMessage}</p>
                </div>
              )
            ) : (
              <span className="small text-muted">글꼴 확인 중...</span>
            )}
          </div>
        </aside>
      </div>

      {/* Step Bottom Navigation */}
      <div className="step-bottom-nav">
        <button
          type="button"
          className="btn btn-secondary btn-lg"
          onClick={() => setStep(2)}
        >
          &lt; 이전 단계: 사진 매칭
        </button>

        <div className="nav-help">
          {!canProceedToStep4 && (
            <span className="text-amber">
              {blockingIssues.find((i) => i.stage <= 3)?.description ??
                "* 확인이 필요한 사진이나 이름 오류를 먼저 해결해 주세요."}
            </span>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!canProceedToStep4}
          onClick={() => setStep(4)}
        >
          다음 단계: 인쇄 미리보기 &gt;
        </button>
      </div>
    </div>
  );
}
