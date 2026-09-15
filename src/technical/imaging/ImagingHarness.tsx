import { useEffect, useRef, useState, useCallback } from "react";
import {
  computeCoverCrop,
  computeZoomedCrop,
  panCrop,
  verifyRoundtrip,
} from "./crop";
import { normalizeImageOrientation } from "./exif";
import { FaceDetectorClient, type FaceDetectionClientResult } from "./faceClient";
import { renderCardPhoto, renderEditorView } from "./canvasRenderer";
import { TEST_CASES } from "./fixtures";
import {
  IMAGING_CONSTANTS,
  type CropRect,
  type CropResult,
  type FaceDetectionData,
  type ImagingIssue,
} from "./types";

export function ImagingHarness() {
  const [selectedCaseId, setSelectedCaseId] = useState<string>("single");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [workerStatus, setWorkerStatus] = useState<string>("대기 중");
  const [detectionResult, setDetectionResult] = useState<FaceDetectionClientResult | null>(null);

  // Active image metadata & canvas
  const [imageCanvas, setImageCanvas] = useState<HTMLCanvasElement | null>(null);
  const [imageWidth, setImageWidth] = useState<number>(0);
  const [imageHeight, setImageHeight] = useState<number>(0);
  const [exifOrientation, setExifOrientation] = useState<number>(1);

  // Interactive editing state
  const [currentCrop, setCurrentCrop] = useState<CropRect | null>(null);
  const [zoom, setZoom] = useState<number>(1.0);
  const [autoCropResult, setAutoCropResult] = useState<CropResult | null>(null);
  const [userConfirmed, setUserConfirmed] = useState<boolean>(false);
  const [issues, setIssues] = useState<readonly ImagingIssue[]>([]);

  // Canvas refs
  const editorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorClientRef = useRef<FaceDetectorClient | null>(null);
  const requestRevisionRef = useRef(0);

  // Initialize client on mount
  useEffect(() => {
    detectorClientRef.current = new FaceDetectorClient();
    return () => {
      requestRevisionRef.current += 1;
      detectorClientRef.current?.terminate();
      detectorClientRef.current = null;
    };
  }, []);

  // Process an image blob
  const processBlob = useCallback(async (blob: Blob, caseLabel: string) => {
    const client = detectorClientRef.current;
    if (!client) return;
    const revision = ++requestRevisionRef.current;
    setIsProcessing(true);
    setCurrentCrop(null);
    setDetectionResult(null);
    setIssues([]);
    setWorkerStatus(`방향 보정 및 얼굴 검출 중 (${caseLabel})...`);
    setUserConfirmed(false);

    try {
      // 1. Single orientation normalizer (TRD §7.1)
      const oriented = await normalizeImageOrientation(blob);
      if (revision !== requestRevisionRef.current) return;
      setImageCanvas(oriented.canvas);
      setImageWidth(oriented.width);
      setImageHeight(oriented.height);
      setExifOrientation(oriented.exifOrientation);

      // 2. Transfer image to dedicated Worker for face detection
      const bitmap = await createImageBitmap(oriented.canvas);
      if (revision !== requestRevisionRef.current) { bitmap.close(); return; }
      const res = await client.detectFaces(
        bitmap,
        oriented.width,
        oriented.height,
      );
      if (revision !== requestRevisionRef.current) return;

      setDetectionResult(res);
      setAutoCropResult(res.cropResult);
      setCurrentCrop(res.cropResult.crop);
      setZoom(res.cropResult.zoom);
      setIssues(res.cropResult.issues);

      setWorkerStatus(
        res.timedOut
          ? "시간 초과 (10초) - 중앙 cover 대체"
          : !res.success ? "자동 검출 실패 - 중앙 cover에서 수동 편집 가능"
          : `완료 (${res.faceCount}명 검출, ${res.durationMs.toFixed(1)}ms)`,
      );
    } catch (err) {
      if (revision !== requestRevisionRef.current) return;
      setWorkerStatus(`오류: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (revision === requestRevisionRef.current) setIsProcessing(false);
    }
  }, []);

  // Run test case when selection changes
  useEffect(() => {
    const testCase = TEST_CASES.find((tc) => tc.id === selectedCaseId);
    if (!testCase) return;

    let active = true;
    void testCase.generate().then(({ blob }) => {
      if (active) {
        void processBlob(blob, testCase.name);
      }
    });

    return () => {
      active = false;
    };
  }, [selectedCaseId, processBlob]);

  // Handle custom file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedCaseId("custom");
    void processBlob(file, file.name);
  };

  // Re-render canvases when crop or image changes
  useEffect(() => {
    if (!imageCanvas || !currentCrop || imageWidth <= 0 || imageHeight <= 0) return;

    // 1. Render Card Output Canvas (22.4 x 26.3mm -> 265 x 311px)
    if (cardCanvasRef.current) {
      renderCardPhoto(imageCanvas, currentCrop, cardCanvasRef.current, {
        targetWidth: IMAGING_CONSTANTS.MIN_PRINT_WIDTH_PX,
        targetHeight: IMAGING_CONSTANTS.MIN_PRINT_HEIGHT_PX,
        showGuides: true,
      });
    }

    // 2. Render Editor Canvas with overlay and landmarks
    if (editorCanvasRef.current) {
      const maxDisplayW = 480;
      const displayScale = Math.min(1.0, maxDisplayW / imageWidth);
      const faces: FaceDetectionData[] = detectionResult?.faces ? [...detectionResult.faces] : [];
      renderEditorView(
        imageCanvas,
        imageWidth,
        imageHeight,
        currentCrop,
        faces,
        editorCanvasRef.current,
        displayScale,
      );
    }
  }, [imageCanvas, currentCrop, imageWidth, imageHeight, detectionResult]);

  // Manual Adjustments
  const handleZoomChange = (newZoom: number) => {
    if (!currentCrop || imageWidth <= 0 || imageHeight <= 0) return;
    const nextCrop = computeZoomedCrop(currentCrop, imageWidth, imageHeight, newZoom);
    setCurrentCrop(nextCrop);
    setZoom(newZoom);
  };

  const handlePan = (photoDeltaXRatio: number, photoDeltaYRatio: number) => {
    if (!currentCrop || imageWidth <= 0 || imageHeight <= 0) return;
    // Note TRD §8: Photo movement direction is opposite of crop window movement direction
    const cropDeltaX = -photoDeltaXRatio * currentCrop.width;
    const cropDeltaY = -photoDeltaYRatio * currentCrop.height;
    const nextCrop = panCrop(currentCrop, imageWidth, imageHeight, cropDeltaX, cropDeltaY);
    setCurrentCrop(nextCrop);
  };

  // Key navigation (TRD §8: normal 0.5%, shift 2.5%)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!currentCrop) return;
    const step = e.shiftKey
      ? IMAGING_CONSTANTS.PAN_SHIFT_STEP_RATIO
      : IMAGING_CONSTANTS.PAN_STEP_RATIO;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        handlePan(0, step); // photo moves up, crop moves down
        break;
      case "ArrowDown":
        e.preventDefault();
        handlePan(0, -step);
        break;
      case "ArrowLeft":
        e.preventDefault();
        handlePan(step, 0);
        break;
      case "ArrowRight":
        e.preventDefault();
        handlePan(-step, 0);
        break;
    }
  };

  // Reset actions (TRD §8)
  const handleResetAuto = () => {
    if (!autoCropResult) return;
    setCurrentCrop(autoCropResult.crop);
    setZoom(autoCropResult.zoom);
    setIssues(autoCropResult.issues);
  };

  const handleResetCover = () => {
    if (imageWidth <= 0 || imageHeight <= 0) return;
    const cover = computeCoverCrop(imageWidth, imageHeight);
    setCurrentCrop(cover);
    setZoom(1.0);
    setUserConfirmed(false);
  };

  const handleConfirmPhoto = () => {
    setUserConfirmed(true);
  };

  // Roundtrip calculation check
  const roundtrip = currentCrop && imageWidth > 0 && imageHeight > 0
    ? verifyRoundtrip(currentCrop, imageWidth, imageHeight)
    : null;

  const currentTestCase = TEST_CASES.find((tc) => tc.id === selectedCaseId);
  const requiresConfirmation =
    !userConfirmed &&
    (issues.some((i) => i.requiresConfirmation) ||
      (detectionResult && detectionResult.faceCount !== 1));

  return (
    <main className="harness-shell" onKeyDown={handleKeyDown} tabIndex={0}>
      <header className="hero">
        <p className="eyebrow">S00.03 · 얼굴 검출 · EXIF · 크롭 좌표 시험</p>
        <h1>조직보드 사진 자동·수동 편집 Spike</h1>
        <p>
          MediaPipe FaceDetector Worker(로컬 TFLite·WASM), EXIF 1~8 정규화, 비율 좌표계,
          중심 보존 줌(1~5배) 및 수동 복구 인터랙션을 검증합니다.
        </p>
      </header>

      {/* Test Case Selector */}
      <section className="check-card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ width: "100%" }}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>합성 fixture 및 시험 케이스 선택</h2>
          <p className="detail" style={{ marginBottom: "1rem" }}>
            단일, 없음, 다중, 세로형, 가로형, 가장자리 clamp, 저해상도 및 EXIF 1~8 fixture를 선택하거나
            임의 이미지를 업로드할 수 있습니다.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
            {TEST_CASES.map((tc) => (
              <button
                key={tc.id}
                type="button"
                className={`summary-badge ${selectedCaseId === tc.id ? "ready" : "pending"}`}
                style={{
                  cursor: "pointer",
                  border: "none",
                  padding: "0.4rem 0.8rem",
                  fontSize: "0.85rem",
                  textAlign: "left",
                }}
                onClick={() => {
                  if (tc.id !== selectedCaseId) requestRevisionRef.current += 1;
                  setSelectedCaseId(tc.id);
                }}
              >
                {tc.name}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <label style={{ fontSize: "0.9rem", fontWeight: 600 }}>
              로컬 이미지 직접 시험:
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={handleFileUpload}
                style={{ marginLeft: "0.5rem" }}
              />
            </label>
            <span
              style={{
                fontSize: "0.85rem",
                color: isProcessing ? "#ffae01" : "#47b50b",
                fontWeight: "bold",
              }}
            >
              상태: {workerStatus}
            </span>
          </div>

          {currentTestCase && (
            <p className="detail" style={{ marginTop: "0.75rem", background: "#222", padding: "0.5rem 0.75rem", borderRadius: "4px" }}>
              <strong>케이스 설명:</strong> {currentTestCase.description}
            </p>
          )}
        </div>
      </section>

      {/* Warnings & Confirmation Banner */}
      {issues.length > 0 && (
        <section
          className="check-card"
          style={{
            marginBottom: "1.5rem",
            borderLeft: requiresConfirmation ? "4px solid #ffae01" : "4px solid #0196ff",
          }}
        >
          <div style={{ width: "100%" }}>
            <h3 style={{ fontSize: "1rem", margin: "0 0 0.5rem 0", color: requiresConfirmation ? "#ffae01" : "#0196ff" }}>
              {requiresConfirmation ? "⚠️ 확인 필요 경고 (User Confirmation Required)" : "ℹ️ 사진 안내"}
            </h3>
            <ul style={{ margin: "0 0 0.75rem 1.25rem", padding: 0 }}>
              {issues.map((issue, idx) => (
                <li key={idx} style={{ fontSize: "0.9rem", marginBottom: "0.25rem" }}>
                  <strong>[{issue.code}]</strong> {issue.message}
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <button
                type="button"
                onClick={handleConfirmPhoto}
                disabled={userConfirmed}
                style={{
                  backgroundColor: userConfirmed ? "#47b50b" : "#ffae01",
                  color: "#000",
                  fontWeight: "bold",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "4px",
                  cursor: userConfirmed ? "default" : "pointer",
                }}
              >
                {userConfirmed ? "✓ 확인 완료 (이 사진 사용됨)" : "이 사진 사용 (확인 완료)"}
              </button>
              <span style={{ fontSize: "0.85rem", color: userConfirmed ? "#47b50b" : "#aaa" }}>
                {userConfirmed
                  ? "사용자가 수동 조정을 확인했습니다. 인쇄 진행이 허용됩니다."
                  : "자동 배치가 미탐지·다중얼굴·구도편차 상태일 때 수동 확인이 필요합니다."}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Main Interactive Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
        {/* Left: Editor View */}
        <section className="check-card">
          <div style={{ width: "100%" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>크롭 영역 및 얼굴 기준점 편집기</h3>
            <p className="detail" style={{ marginBottom: "0.75rem" }}>
              파란색: 크롭 영역 (22.4 : 26.3 비율 유지) | 초록 점선: 검출 얼굴 | 분홍 점: 랜드마크 | 파란 점: 두 눈 중점
            </p>

            <div style={{ background: "#111", padding: "0.5rem", borderRadius: "4px", display: "flex", justifyContent: "center" }}>
              <canvas
                ref={editorCanvasRef}
                style={{
                  maxWidth: "100%",
                  height: "auto",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                }}
              />
            </div>

            {/* Controls */}
            <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {/* Zoom Slider */}
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <label style={{ minWidth: "100px", fontSize: "0.9rem", fontWeight: 600 }}>
                  확대율 (줌 1~5배):
                </label>
                <input
                  type="range"
                  min="1.0"
                  max="5.0"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ minWidth: "50px", fontFamily: "monospace", fontSize: "0.9rem" }}>
                  {zoom.toFixed(2)}x
                </span>
              </div>

              {/* Pan Buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.9rem", fontWeight: 600, marginRight: "0.5rem" }}>
                  위치 이동 (키보드 방향키 가능):
                </span>
                <button type="button" onClick={() => handlePan(0, 0.05)} style={{ padding: "0.3rem 0.6rem" }}>
                  ↑ 위
                </button>
                <button type="button" onClick={() => handlePan(0, -0.05)} style={{ padding: "0.3rem 0.6rem" }}>
                  ↓ 아래
                </button>
                <button type="button" onClick={() => handlePan(0.05, 0)} style={{ padding: "0.3rem 0.6rem" }}>
                  ← 좌
                </button>
                <button type="button" onClick={() => handlePan(-0.05, 0)} style={{ padding: "0.3rem 0.6rem" }}>
                  → 우
                </button>
                <span style={{ fontSize: "0.8rem", color: "#888", marginLeft: "auto" }}>
                  단축키: 방향키 (0.5%), Shift+방향키 (2.5%)
                </span>
              </div>

              {/* Reset Buttons */}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                <button
                  type="button"
                  onClick={handleResetAuto}
                  style={{
                    padding: "0.4rem 0.8rem",
                    backgroundColor: "#333",
                    color: "#fff",
                    border: "1px solid #555",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  자동 초기화 (최근 모델 검출값)
                </button>
                <button
                  type="button"
                  onClick={handleResetCover}
                  style={{
                    padding: "0.4rem 0.8rem",
                    backgroundColor: "#333",
                    color: "#fff",
                    border: "1px solid #555",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                >
                  원본 기준 초기화 (중앙 Cover)
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Right: Card Photo Output & Coordinate Metrics */}
        <section className="check-card">
          <div style={{ width: "100%" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>22.4 × 26.3mm 카드 인쇄 미리보기</h3>
            <p className="detail" style={{ marginBottom: "0.75rem" }}>
              300ppi 최소 정수 크기 (265 × 311px). 점선: 눈높이 38%, 주황 사각: 얼굴 55% 가이드라인.
            </p>

            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
              <div
                style={{
                  border: "1px solid #444",
                  padding: "4px",
                  background: "#fff",
                  display: "inline-block",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                }}
              >
                <canvas ref={cardCanvasRef} style={{ display: "block" }} />
              </div>
            </div>

            {/* Diagnostic Table */}
            <h4 style={{ fontSize: "0.9rem", margin: "1rem 0 0.5rem 0" }}>좌표계 및 검증 지표 (TRD §7·§8)</h4>
            <table style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "collapse" }}>
              <tbody>
                <tr style={{ borderBottom: "1px solid #333" }}>
                  <td style={{ padding: "0.3rem 0", color: "#aaa" }}>방향 보정 원본 크기</td>
                  <td style={{ padding: "0.3rem 0", fontFamily: "monospace", textAlign: "right" }}>
                    {imageWidth} × {imageHeight} px
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #333" }}>
                  <td style={{ padding: "0.3rem 0", color: "#aaa" }}>EXIF 회전 태그</td>
                  <td style={{ padding: "0.3rem 0", fontFamily: "monospace", textAlign: "right" }}>
                    {exifOrientation} ({exifOrientation === 1 ? "정상 0°" : `Orientation ${exifOrientation}`})
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #333" }}>
                  <td style={{ padding: "0.3rem 0", color: "#aaa" }}>검출 얼굴 수</td>
                  <td style={{ padding: "0.3rem 0", fontFamily: "monospace", textAlign: "right" }}>
                    {detectionResult?.faceCount ?? 0}명
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #333" }}>
                  <td style={{ padding: "0.3rem 0", color: "#aaa" }}>크롭 좌표 (x, y, w, h)</td>
                  <td style={{ padding: "0.3rem 0", fontFamily: "monospace", textAlign: "right" }}>
                    {currentCrop
                      ? `${currentCrop.x.toFixed(1)}, ${currentCrop.y.toFixed(1)}, ${currentCrop.width.toFixed(1)}, ${currentCrop.height.toFixed(1)}`
                      : "-"}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #333" }}>
                  <td style={{ padding: "0.3rem 0", color: "#aaa" }}>정규화 비율 좌표 [0, 1]</td>
                  <td style={{ padding: "0.3rem 0", fontFamily: "monospace", textAlign: "right" }}>
                    {currentCrop && imageWidth > 0 && imageHeight > 0
                      ? `(${(currentCrop.x / imageWidth).toFixed(3)}, ${(currentCrop.y / imageHeight).toFixed(3)})`
                      : "-"}
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #333" }}>
                  <td style={{ padding: "0.3rem 0", color: "#aaa" }}>줌 배율</td>
                  <td style={{ padding: "0.3rem 0", fontFamily: "monospace", textAlign: "right" }}>
                    {zoom.toFixed(2)}x (범위 1.0~5.0)
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #333" }}>
                  <td style={{ padding: "0.3rem 0", color: "#aaa" }}>환산 왕복 오차 (≤ 1px 기준)</td>
                  <td
                    style={{
                      padding: "0.3rem 0",
                      fontFamily: "monospace",
                      textAlign: "right",
                      color: roundtrip?.passed ? "#47b50b" : "#ff01a2",
                    }}
                  >
                    {roundtrip
                      ? `${roundtrip.maxErrorPx.toExponential(2)}px (기준 충족: ${roundtrip.passed ? "합격" : "불합격"})`
                      : "-"}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "0.3rem 0", color: "#aaa" }}>사용자 최종 확인</td>
                  <td
                    style={{
                      padding: "0.3rem 0",
                      fontFamily: "monospace",
                      textAlign: "right",
                      color: userConfirmed ? "#47b50b" : requiresConfirmation ? "#ffae01" : "#aaa",
                    }}
                  >
                    {userConfirmed ? "확인 완료 (사용 승인)" : requiresConfirmation ? "확인 대기 중" : "정상 자동 완료"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside className="boundary-note">
        <strong>S00.03 기술 시험 범위 및 한계</strong>
        <span>
          이 화면은 얼굴 검출·크롭 좌표계 및 수동 조작 spike 검증 화면입니다. 실제 직원 데이터는 수집·보관하지 않으며,
          S00.04(PDF) 연결은 후속 단계에서 진행됩니다.
        </span>
      </aside>
    </main>
  );
}

export default ImagingHarness;
