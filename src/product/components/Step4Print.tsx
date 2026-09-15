import { useMemo, useRef, useState } from "react";
import { buildDocumentRenderPlan } from "../../technical/pdf/renderPlan";
import type { CardRenderPlan, DocumentRenderPlan } from "../../technical/pdf/types";
import { generatePdfViaWorker } from "../services/pdfWorkerClient";
import { useSession } from "../state/sessionContext";

export function Step4Print() {
  const {
    state,
    setStep,
    canGeneratePdf,
    blockingIssues,
    setGeneratingPdf,
    toggleCalibrationMarks,
  } = useSession();

  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState<number>(0.75); // 75% default preview scale
  const [downloadSuccessUrl, setDownloadSuccessUrl] = useState<string | null>(null);
  const activeJobCancelRef = useRef<(() => void) | null>(null);

  // Total pages
  const totalEmployees = state.employees.length;
  const totalPages = Math.max(1, Math.ceil(totalEmployees / 21));

  // Build DocumentRenderPlan
  const documentPlan = useMemo<DocumentRenderPlan | null>(() => {
    if (!state.font || totalEmployees === 0) return null;

    const inputs = state.employees.map((emp) => {
      const edit = state.edits[emp.id];
      return {
        employeeId: emp.id,
        name: emp.name,
        jobCategory: emp.jobCategory,
        contractType: emp.contractType,
        photoCrop: edit?.crop ?? { x: 0, y: 0, width: 224, height: 263 },
        photoRevision: edit?.revision ?? 1,
      };
    });

    return buildDocumentRenderPlan(inputs, state.font);
  }, [state.employees, state.edits, state.font, totalEmployees]);

  // Cards for current page
  const currentPageCards = useMemo(() => {
    if (!documentPlan) return [];
    return documentPlan.cards.filter((c) => c.pagePosition.pageIndex === currentPageIndex);
  }, [documentPlan, currentPageIndex]);

  // Main thread helper to render raster photo to JPEG Uint8Array
  const cropSinglePhotoOnMainThread = async (cardPlan: CardRenderPlan): Promise<Uint8Array> => {
    const link = state.links.find((l) => l.employeeId === cardPlan.employeeId);
    if (!link) {
      throw new Error(`직원 #${cardPlan.employeeId}의 사진 연결을 찾을 수 없습니다.`);
    }
    const photo = state.photos.find((p) => p.id === link.photoId);
    if (!photo) {
      throw new Error(`직원 #${cardPlan.employeeId}의 사진 데이터를 찾을 수 없습니다.`);
    }

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = 265;
    cropCanvas.height = 311;
    const ctx = cropCanvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context creation failed");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(
      photo.canvas,
      cardPlan.photoCrop.x,
      cardPlan.photoCrop.y,
      cardPlan.photoCrop.width,
      cardPlan.photoCrop.height,
      0,
      0,
      265,
      311,
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      cropCanvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error("사진 래스터화 실패"));
        },
        "image/jpeg",
        0.92,
      );
    });

    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  };

  const handleGeneratePdf = async () => {
    if (!documentPlan || !state.fontBytes || !canGeneratePdf) return;

    setGeneratingPdf(true);

    try {
      // 1. Prepare rasterized photos on main thread Canvas
      const photoBuffers: { employeeId: string; photoBytes: Uint8Array }[] = [];
      for (const card of documentPlan.cards) {
        const photoBytes = await cropSinglePhotoOnMainThread(card);
        photoBuffers.push({
          employeeId: card.employeeId,
          photoBytes,
        });
      }

      // 2. Offload heavy PDF compilation and font embedding to dedicated PDF Worker
      const job = generatePdfViaWorker(
        documentPlan,
        state.fontBytes,
        photoBuffers,
        { includeCalibrationMarks: state.includeCalibrationMarks },
        60_000,
      );
      activeJobCancelRef.current = job.cancel;

      const pdfBytes = await job.promise;
      activeJobCancelRef.current = null;

      // 3. Clean up previous URL if any
      if (downloadSuccessUrl) {
        URL.revokeObjectURL(downloadSuccessUrl);
      }

      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setDownloadSuccessUrl(url);

      // 4. Download file
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const fileName = `조직보드_${yyyy}-${mm}-${dd}.pdf`;

      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setGeneratingPdf(false);
    } catch (err) {
      activeJobCancelRef.current = null;
      console.error("PDF generation failed:", err);
      setGeneratingPdf(
        false,
        err instanceof Error ? err.message : "PDF 생성 중 오류가 발생했습니다.",
      );
    }
  };

  const handleCancelGeneration = () => {
    if (activeJobCancelRef.current) {
      activeJobCancelRef.current();
      activeJobCancelRef.current = null;
    }
    setGeneratingPdf(false, "사용자에 의해 PDF 생성이 취소되었습니다.");
  };

  return (
    <div className="step-container step4-print">
      <div className="step-intro">
        <h2>4단계: 인쇄 미리보기 및 PDF 다운로드</h2>
        <p className="step-desc">
          A4 가로 규격(297 × 210mm)에 7열 × 3행(페이지당 21명)으로 정밀 배치된 인쇄 페이지를 확인하고,
          100% 실제 크기 인쇄용 PDF를 생성합니다.
        </p>
      </div>

      {/* Blocking Issues Alert */}
      {blockingIssues.length > 0 && (
        <div className="alert alert-danger" role="alert">
          <div className="alert-header">
            <strong>⚠️ PDF 출력을 진행하기 전에 해결해야 할 항목이 있습니다:</strong>
          </div>
          <ul className="mb-0 mt-2 pl-4">
            {blockingIssues.map((issue, idx) => (
              <li key={idx}>
                <strong>[{issue.title}]</strong> {issue.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* PDF Generation Error */}
      {state.pdfGenerationError && (
        <div className="alert alert-danger">
          <strong>PDF 생성 오류 / 알림:</strong> {state.pdfGenerationError}
        </div>
      )}

      {/* Download Success Notice */}
      {downloadSuccessUrl && (
        <div className="alert alert-success print-guide-banner">
          <h4>🎉 PDF 다운로드가 완료되었습니다!</h4>
          <p className="mb-1">실제 출력 시 다음 프린터 설정을 반드시 확인해 주세요:</p>
          <ul className="guide-checklist">
            <li>
              <strong>용지 방향:</strong> A4 가로 (Landscape, 297 × 210mm)
            </li>
            <li>
              <strong>인쇄 배율:</strong> 반드시 <strong>'실제 크기'</strong> 또는 <strong>'100%'</strong> 선택
            </li>
            <li>
              <strong>주의:</strong> '용지에 맞춤', '여백에 맞춤', 또는 '85% 축소'를 <strong>해제</strong>하세요.
            </li>
            <li>
              <strong>규격 확인:</strong> 출력 후 카드를 자로 측정했을 때 정확히 <strong>25 × 38mm</strong>(±0.5mm)인지 확인하세요.
            </li>
          </ul>
        </div>
      )}

      {/* Page Preview Controls */}
      <div className="preview-toolbar">
        <div className="page-pagination">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => setCurrentPageIndex((p) => Math.max(0, p - 1))}
            disabled={currentPageIndex <= 0}
          >
            &lt; 이전 페이지
          </button>
          <span className="page-indicator">
            페이지 <strong>{currentPageIndex + 1}</strong> / {totalPages} (총 {totalEmployees}명)
          </span>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => setCurrentPageIndex((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPageIndex >= totalPages - 1}
          >
            다음 페이지 &gt;
          </button>
        </div>

        <div className="zoom-view-controls">
          <span className="control-label">미리보기 배율:</span>
          <button
            type="button"
            className={`btn btn-xs ${zoomLevel === 0.5 ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={() => setZoomLevel(0.5)}
          >
            50%
          </button>
          <button
            type="button"
            className={`btn btn-xs ${zoomLevel === 0.75 ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={() => setZoomLevel(0.75)}
          >
            75%
          </button>
          <button
            type="button"
            className={`btn btn-xs ${zoomLevel === 1.0 ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={() => setZoomLevel(1.0)}
          >
            100%
          </button>
        </div>
      </div>

      {/* A4 Landscape Sheet Preview */}
      <div className="a4-sheet-viewport">
        <div
          className="a4-sheet-container"
          style={{
            transform: `scale(${zoomLevel})`,
            transformOrigin: "top center",
          }}
        >
          <div className="a4-sheet-paper">
            {/* 7 Columns x 3 Rows = 21 slots grid */}
            <div className="a4-grid-area">
              {Array.from({ length: 21 }, (_, slotIndex) => {
                const card = currentPageCards.find((c) => c.pagePosition.slotIndex === slotIndex);
                if (!card) {
                  // Empty slot: no card, no border per TRD §10.1 & FRD F7.5
                  return <div key={slotIndex} className="a4-empty-slot" />;
                }

                const link = state.links.find((l) => l.employeeId === card.employeeId);
                const photo = link ? state.photos.find((p) => p.id === link.photoId) : null;

                return (
                  <div key={card.employeeId} className="a4-card-slot">
                    <div className="sheet-card-box">
                      {/* Photo Area */}
                      <div className="sheet-photo-area">
                        {photo ? (
                          <img
                            src={photo.objectUrl}
                            alt={card.name}
                            className="sheet-photo-img"
                            style={{
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          <div className="sheet-photo-empty">사진</div>
                        )}
                      </div>

                      {/* Chip Area */}
                      <div
                        className="sheet-chip-area"
                        style={{ backgroundColor: card.chipColorHex }}
                      />

                      {/* Name Area */}
                      <div className="sheet-name-area">
                        {card.nameLayout.lines.map((line, lIdx) => (
                          <div
                            key={lIdx}
                            className="sheet-name-line"
                            style={{ fontSize: `${card.nameLayout.fontSize * 0.9}pt` }}
                          >
                            {line}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="a4-footer-info">
              <span>A4 가로 297 × 210mm · 조직보드 사진 규격 25 × 38mm</span>
              <span>
                페이지 {currentPageIndex + 1} / {totalPages}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Output Configuration & Download Button */}
      <div className="print-action-card">
        <div className="action-settings">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={state.includeCalibrationMarks}
              onChange={(e) => toggleCalibrationMarks(e.target.checked)}
              disabled={state.isGeneratingPdf}
            />
            <span>실물 인쇄 검증용 100mm 눈금자 포함 (출력 후 자로 실측하여 100% 일치 확인)</span>
          </label>
        </div>

        <div className="action-buttons-row">
          <button
            type="button"
            className="btn btn-secondary btn-lg"
            onClick={() => setStep(3)}
            disabled={state.isGeneratingPdf}
          >
            &lt; 이전 단계: 사진 편집
          </button>

          {state.isGeneratingPdf ? (
            <div className="generating-action-group" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button type="button" className="btn btn-secondary btn-lg" onClick={handleCancelGeneration}>
                생성 취소
              </button>
              <button type="button" className="btn btn-success btn-lg download-btn" disabled>
                <span>⏳ Worker에서 PDF 생성 중...</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-success btn-lg download-btn"
              disabled={!canGeneratePdf}
              onClick={() => void handleGeneratePdf()}
            >
              <span>📥 인쇄용 PDF 다운로드</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
