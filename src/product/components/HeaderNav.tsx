import { useSession } from "../state/sessionContext";

export interface HeaderNavProps {
  readonly onRequestReset: () => void;
}

export function HeaderNav({ onRequestReset }: HeaderNavProps) {
  const {
    state,
    setStep,
    summaryCounts,
    canProceedToStep2,
    canProceedToStep3,
    canProceedToStep4,
  } = useSession();

  const currentStep = state.step;

  const steps = [
    { number: 1, title: "1. 직원 정보", accessible: true },
    { number: 2, title: "2. 사진 매칭", accessible: canProceedToStep2 },
    { number: 3, title: "3. 사진 편집", accessible: canProceedToStep3 },
    { number: 4, title: "4. PDF 출력", accessible: canProceedToStep4 },
  ] as const;

  return (
    <header className="product-header">
      <div className="header-top-row">
        <div className="brand-group">
          <h1 className="brand-title">조직보드 사진 제작 시스템</h1>
          <span className="privacy-pill" title="직원 정보와 사진을 외부 서버로 전송하지 않고 브라우저 내부에서만 처리합니다.">
            🔒 로컬 브라우저 전용 (외부 전송 없음)
          </span>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={onRequestReset}
            title="모든 작업 데이터를 삭제하고 첫 상태로 되돌립니다."
          >
            작업 초기화
          </button>
        </div>
      </div>

      <nav className="step-navigation" aria-label="작업 단계">
        <ol className="step-list">
          {steps.map((s) => {
            const isCurrent = currentStep === s.number;
            const isCompleted = currentStep > s.number;
            const canJump = s.accessible || isCompleted;

            return (
              <li
                key={s.number}
                className={`step-item ${isCurrent ? "current" : ""} ${isCompleted ? "completed" : ""}`}
              >
                <button
                  type="button"
                  className="step-btn"
                  disabled={!canJump}
                  onClick={() => canJump && setStep(s.number as 1 | 2 | 3 | 4)}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <span className="step-badge">{s.number}</span>
                  <span className="step-name">{s.title.slice(3)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="summary-status-bar">
        <div className="summary-stat-chip">
          <span className="stat-label">등록 인원</span>
          <span className="stat-value">{summaryCounts.totalEmployees}명</span>
        </div>
        <div className="summary-stat-chip">
          <span className="stat-label">사진 연결</span>
          <span className="stat-value text-success">
            {summaryCounts.matchedCount}명
          </span>
        </div>
        <div className="summary-stat-chip">
          <span className="stat-label">미매칭</span>
          <span className={`stat-value ${summaryCounts.unmatchedEmployeesCount > 0 ? "text-amber" : ""}`}>
            {summaryCounts.unmatchedEmployeesCount}명
          </span>
        </div>
        <div className="summary-stat-chip">
          <span className="stat-label">확인 필요</span>
          <span className={`stat-value ${summaryCounts.reviewRequiredCount > 0 ? "text-danger" : ""}`}>
            {summaryCounts.reviewRequiredCount}건
          </span>
        </div>
      </div>
    </header>
  );
}
