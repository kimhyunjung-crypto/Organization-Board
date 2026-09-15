import { useEffect, useMemo, useRef, useState } from "react";
import { renderCardPhoto } from "../imaging/canvasRenderer";
import { renderCardToCanvas } from "./canvasCardRenderer";
import { JOB_COLORS } from "./constants";
import {
  NEGATIVE_TEST_NAMES,
  SYNTHETIC_CALIBRATION_CARDS,
  SYNTHETIC_IMAGE_URL,
} from "./fixtures";
import { loadNanumGothicFont, type FontkitFont } from "./fontLoader";
import { computeNameLayout } from "./nameLayout";
import { generateBoardPdf } from "./pdfGenerator";
import "./pdf.css";
import {
  buildCardRenderPlan,
  buildDocumentRenderPlan,
  type EmployeeCardInput,
} from "./renderPlan";
import type { ContractType, JobCategory } from "./types";

export function PdfHarness() {
  const [fontkitFont, setFontkitFont] = useState<FontkitFont | null>(null);
  const [fontBytes, setFontBytes] = useState<Uint8Array | null>(null);
  const [fontLoadError, setFontLoadError] = useState<string | null>(null);

  // Synthetic image element cache
  const [portraitImg, setPortraitImg] = useState<HTMLImageElement | null>(null);

  // Interactive controls
  const [customName, setCustomName] = useState<string>("김철수 수석");
  const [selectedJob, setSelectedJob] = useState<JobCategory>("개발(CE)");
  const [selectedContract, setSelectedContract] = useState<ContractType>("정규직");
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [selectedSyntheticIndex, setSelectedSyntheticIndex] = useState<number>(0);

  // PDF Generation State
  const [pdfStatus, setPdfStatus] = useState<{
    readonly state: "idle" | "generating" | "success" | "error";
    readonly message?: string;
    readonly byteSize?: number;
    readonly durationMs?: number;
    readonly url?: string;
  }>({ state: "idle" });

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 1. Load Font
  useEffect(() => {
    let active = true;
    loadNanumGothicFont()
      .then(({ font, fontBytes: bytes }) => {
        if (active) {
          setFontkitFont(font);
          setFontBytes(bytes);
        }
      })
      .catch((err) => {
        if (active) {
          setFontLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // 2. Load Synthetic Image
  useEffect(() => {
    let active = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (active) setPortraitImg(img);
    };
    img.src = SYNTHETIC_IMAGE_URL;
    return () => {
      active = false;
    };
  }, []);

  // 3. Name Layout Calculation for interactive input
  const nameLayout = useMemo(() => {
    if (!fontkitFont) return null;
    return computeNameLayout(customName, fontkitFont);
  }, [customName, fontkitFont]);

  // 4. Current preview card plan
  const previewPlan = useMemo(() => {
    if (!fontkitFont) return null;
    const input: EmployeeCardInput = {
      employeeId: "preview-card",
      name: customName,
      jobCategory: selectedJob,
      contractType: selectedContract,
      photoCrop: {
        x: 93,
        y: 0,
        width: 1068,
        height: 1254,
      },
      photoSourceUrl: SYNTHETIC_IMAGE_URL,
    };
    return buildCardRenderPlan(input, selectedSyntheticIndex, fontkitFont);
  }, [customName, selectedJob, selectedContract, fontkitFont, selectedSyntheticIndex]);

  // 5. Render to Canvas
  useEffect(() => {
    if (!canvasRef.current || !previewPlan) return;
    renderCardToCanvas(previewPlan, canvasRef.current, {
      scale: 300 / 25.4, // 300 ppi
      showGuides,
      photoSource: portraitImg,
    });
  }, [previewPlan, showGuides, portraitImg]);

  // 6. Generate 22-Card Calibration PDF
  const handleDownloadCalibrationPdf = async () => {
    if (!fontkitFont || !fontBytes) return;

    setPdfStatus({ state: "generating", message: "22명 캘리브레이션 PDF 생성 중..." });
    const startTime = performance.now();

    try {
      // Build 22-card plan
      const docPlan = buildDocumentRenderPlan(SYNTHETIC_CALIBRATION_CARDS, fontkitFont);

      // Photo provider using canvas crop
      const photoCanvas = document.createElement("canvas");
      photoCanvas.width = 265;
      photoCanvas.height = 311;

      const photoProvider = async (card: import("./types").CardRenderPlan): Promise<Uint8Array> => {
        if (!portraitImg) {
          throw new Error("합성 인물 이미지가 준비되지 않았습니다.");
        }
        renderCardPhoto(portraitImg, card.photoCrop, photoCanvas, {
          targetWidth: 265,
          targetHeight: 311,
        });
        const blob = await new Promise<Blob | null>((res) => photoCanvas.toBlob(res, "image/png"));
        if (!blob) throw new Error("PNG Blob 생성 실패");
        const buf = await blob.arrayBuffer();
        return new Uint8Array(buf);
      };

      const pdfBytes = await generateBoardPdf(docPlan, fontBytes, photoProvider, {
        includeCalibrationMarks: true,
      });

      const durationMs = Math.round(performance.now() - startTime);
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      // Trigger automatic browser download
      const a = document.createElement("a");
      a.href = url;
      a.download = "org-board-print-calibration.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setPdfStatus({
        state: "success",
        message: `생성 및 다운로드 완료 (22명 / 2페이지)`,
        byteSize: pdfBytes.byteLength,
        durationMs,
        url,
      });
    } catch (err) {
      setPdfStatus({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleSelectSyntheticCard = (index: number) => {
    const card = SYNTHETIC_CALIBRATION_CARDS[index];
    if (!card) return;
    setSelectedSyntheticIndex(index);
    setCustomName(card.name);
    setSelectedJob(card.jobCategory);
    setSelectedContract(card.contractType);
  };

  return (
    <main className="pdf-harness">
      <header className="pdf-hero">
        <p className="eyebrow">S00.04 · 글꼴·카드·실제 인쇄 치수 시험</p>
        <h1>조직보드 인쇄 & PDF 스파이크 Harness</h1>
        <p>
          25 × 38mm 규격 카드와 Nanum Gothic ExtraBold 800 글꼴, A4 7×3 그리드(21명/페이지),
          그리고 100mm 눈금자가 포함된 인쇄 캘리브레이션 PDF 생성을 검증합니다.
        </p>
      </header>

      {/* Notice regarding provisional 7.8mm name height & 100% print requirements */}
      <div className="calibration-notice" role="alert">
        <strong>[인쇄 치수 및 설계 판단 안내]</strong>
        <br />
        • 카드 규격: 25 × 38 mm (허용 오차 ±0.5 mm) · 외곽선 0.6pt (#444444) 안쪽 반선두께 인셋 적용
        <br />
        • 내부 높이: 사진 26.3mm + 칩 2.9mm + 상단 1.0mm + <strong>이름 영역 7.8mm (실사용 7.4mm)</strong>
        &nbsp;— <em>원문 합계 39.2mm 초과로 인한 TRD §1.2 조정안이며, 아직 사용자 최종 승인되지 않은 잠정안입니다.</em>
        <br />
        • 프린터 인쇄 시 반드시 <strong>&quot;실제 크기(100%)&quot;</strong>로 출력해야 하며, &quot;용지에 맞춤&quot;이나 85% 축소 인쇄는 엄격히 금지됩니다.
      </div>

      {/* Font & Local Asset Status */}
      <section className="pdf-panel" aria-labelledby="font-status-title">
        <h2 id="font-status-title">1. 로컬 글꼴 및 엔진 상태</h2>
        <div>
          {fontkitFont ? (
            <p className="status-pass" data-testid="font-status">
              ✓ NanumGothic-ExtraBold TTF 및 @pdf-lib/fontkit 엔진 로드 완료 (UnitsPerEm:{" "}
              {fontkitFont.unitsPerEm}, Ascent: {fontkitFont.ascent}, Descent: {fontkitFont.descent})
            </p>
          ) : fontLoadError ? (
            <p className="status-error" data-testid="font-status">
              ✗ 글꼴 로드 실패: {fontLoadError}
            </p>
          ) : (
            <p data-testid="font-status">글꼴 파일을 불러오는 중입니다...</p>
          )}
          <p className="spreadsheet-help">
            포함 폰트: <code>/assets/fonts/NanumGothic-ExtraBold.ttf</code> (OFL 라이선스 준수, 비식별 정적 자원)
          </p>
        </div>
      </section>

      {/* Interactive Name Layout & Card Preview */}
      <section className="pdf-panel" aria-labelledby="name-engine-title">
        <h2 id="name-engine-title">2. 이름 배치 알고리즘 (TRD §9.3) & 실시간 카드 미리보기</h2>

        <div className="grid-2col">
          {/* Controls & Metrics */}
          <div className="control-group">
            <label htmlFor="name-input">
              <strong>이름 입력:</strong>
            </label>
            <input
              id="name-input"
              data-testid="name-input"
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="이름을 입력하세요"
            />

            <div className="quick-buttons">
              <span style={{ fontSize: "0.8rem", alignSelf: "center", color: "#666" }}>빠른 테스트:</span>
              <button className="quick-btn" type="button" onClick={() => setCustomName("홍길동")}>
                홍길동 (12pt 1줄)
              </button>
              <button className="quick-btn" type="button" onClick={() => setCustomName("황보선생님")}>
                황보선생님 (5자 12pt)
              </button>
              <button className="quick-btn" type="button" onClick={() => setCustomName("김철수 수석")}>
                김철수 수석 (공백분할)
              </button>
              <button className="quick-btn" type="button" onClick={() => setCustomName("알렉산더피터슨")}>
                알렉산더피터슨 (글자분할)
              </button>
              <button className="quick-btn" type="button" onClick={() => setCustomName("John Smith")}>
                John Smith
              </button>
              <button className="quick-btn negative" type="button" onClick={() => setCustomName(NEGATIVE_TEST_NAMES.JAPANESE)}>
                일문(田中) 누락
              </button>
              <button className="quick-btn negative" type="button" onClick={() => setCustomName(NEGATIVE_TEST_NAMES.EMOJI)}>
                이모지(😊) 누락
              </button>
              <button className="quick-btn negative" type="button" onClick={() => setCustomName(NEGATIVE_TEST_NAMES.OVERFLOW)}>
                초장문(Overflow)
              </button>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
              <div>
                <label htmlFor="job-select">직군:&nbsp;</label>
                <select
                  id="job-select"
                  value={selectedJob}
                  onChange={(e) => setSelectedJob(e.target.value as JobCategory)}
                >
                  {Object.keys(JOB_COLORS).map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="contract-select">계약형태:&nbsp;</label>
                <select
                  id="contract-select"
                  value={selectedContract}
                  onChange={(e) => setSelectedContract(e.target.value as ContractType)}
                >
                  <option value="정규직">정규직 (직군색)</option>
                  <option value="계약직">계약직 (#E6B8AF)</option>
                  <option value="아르바이트">아르바이트 (#737373)</option>
                  <option value="파견직">파견직 (#A4C2F4)</option>
                  <option value="인턴">인턴 (#00FFFF)</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: "12px" }}>
              <label>
                <input
                  type="checkbox"
                  checked={showGuides}
                  onChange={(e) => setShowGuides(e.target.checked)}
                />
                &nbsp;가이드선 표시 (사용 가능 이름 영역 22.4 × 7.4mm 파란 점선)
              </label>
            </div>

            {/* Metrics Breakdown */}
            <div className="metrics-box" data-testid="layout-metrics">
              {nameLayout ? (
                <>
                  <div>
                    <strong>배치 결과: </strong>
                    <span
                      className={nameLayout.fits ? "status-pass" : "status-error"}
                      data-testid="layout-fits-status"
                    >
                      {nameLayout.fits ? "PASS (출력 가능)" : `BLOCKED (${nameLayout.error})`}
                    </span>
                  </div>
                  <div>• 원본 문자열: &quot;{nameLayout.rawName}&quot;</div>
                  <div>• 글자 크기: {nameLayout.fontSize} pt</div>
                  <div>• 줄 수: {nameLayout.lines.length} 줄</div>
                  {nameLayout.lines.map((line, idx) => (
                    <div key={idx}>
                      &nbsp;&nbsp;Line {idx + 1}: &quot;{line}&quot; (너비:{" "}
                      {nameLayout.lineMetrics[idx]?.widthPt.toFixed(2)} pt / 기준선 y:{" "}
                      {nameLayout.lineMetrics[idx]?.baselineYPt.toFixed(2)} pt)
                    </div>
                  ))}
                  <div>• 최대 줄 너비: {nameLayout.totalWidthPt.toFixed(2)} pt / 허용 63.50 pt (22.4mm)</div>
                  <div>• 총 텍스트 높이: {nameLayout.totalHeightPt.toFixed(2)} pt / 허용 20.98 pt (7.4mm)</div>
                  {nameLayout.errorMessage && (
                    <div className="status-error" data-testid="layout-error-message">
                      ⚠️ {nameLayout.errorMessage}
                    </div>
                  )}
                </>
              ) : (
                <p>글꼴 계산 대기 중...</p>
              )}
            </div>
          </div>

          {/* Canvas Preview Container */}
          <div className="preview-container">
            <canvas
              ref={canvasRef}
              data-testid="card-preview-canvas"
              className="card-canvas"
              title="25 × 38mm 카드 실시간 미리보기 (300 ppi)"
            />
            <span style={{ fontSize: "0.8rem", color: "#555" }}>
              25 × 38 mm 카드 미리보기 (300 ppi, 295 × 449 px Canvas)
            </span>
          </div>
        </div>
      </section>

      {/* 22-Card Calibration Suite & PDF Download */}
      <section className="pdf-panel" aria-labelledby="calibration-title">
        <h2 id="calibration-title">3. 22인 인쇄 캘리브레이션 시트 (2페이지)</h2>
        <p className="spreadsheet-help">
          21명(1페이지 가득 참) + 1명(2페이지 1슬롯만 채움, 20슬롯 미출력).
          5개 직군 × 5개 계약형태, 1줄/2줄 이름, 100mm 가로/세로 눈금자가 포함됩니다.
        </p>

        <div className="action-bar">
          <button
            className="btn-primary"
            data-testid="download-calibration-pdf-btn"
            type="button"
            disabled={!fontkitFont || pdfStatus.state === "generating"}
            onClick={handleDownloadCalibrationPdf}
          >
            {pdfStatus.state === "generating"
              ? "PDF 생성 중..."
              : "22명 캘리브레이션 PDF 다운로드 (org-board-print-calibration.pdf)"}
          </button>

          {pdfStatus.state === "success" && (
            <div data-testid="pdf-success-info" style={{ fontSize: "0.9rem", color: "#166534" }}>
              ✓ {pdfStatus.message} · 용량: {(pdfStatus.byteSize! / 1024).toFixed(1)} kB · 소요시간:{" "}
              {pdfStatus.durationMs}ms
            </div>
          )}

          {pdfStatus.state === "error" && (
            <div data-testid="pdf-error-info" className="status-error">
              ✗ 생성 실패: {pdfStatus.message}
            </div>
          )}
        </div>

        {/* Mini Grid Overview of the 22 Synthetic Cards */}
        <div style={{ marginTop: "16px" }}>
          <h3>22인 합성 카드 목록 (클릭 시 상단 미리보기에 반영):</h3>
          <div className="calibration-grid-list">
            {SYNTHETIC_CALIBRATION_CARDS.map((card, idx) => (
              <div
                key={card.employeeId}
                className={`mini-card-slot ${selectedSyntheticIndex === idx ? "selected" : ""}`}
                onClick={() => handleSelectSyntheticCard(idx)}
              >
                <div className="slot-header">
                  <span>#{idx + 1}</span>
                  <span>{idx < 21 ? "P1" : "P2"}</span>
                </div>
                <div className="slot-name">{card.name}</div>
                <div style={{ fontSize: "0.72rem", color: "#555" }}>
                  {card.jobCategory} · {card.contractType}
                </div>
                <div
                  className="slot-chip"
                  style={{
                    backgroundColor:
                      card.contractType === "정규직"
                        ? JOB_COLORS[card.jobCategory]
                        : card.contractType === "계약직"
                        ? "#E6B8AF"
                        : card.contractType === "아르바이트"
                        ? "#737373"
                        : card.contractType === "파견직"
                        ? "#A4C2F4"
                        : "#00FFFF",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

export default PdfHarness;
