import { useEffect, useState } from "react";
import { HeaderNav } from "./components/HeaderNav";
import { ResetModal } from "./components/ResetModal";
import { Step1Employees } from "./components/Step1Employees";
import { Step2Matching } from "./components/Step2Matching";
import { Step3Editor } from "./components/Step3Editor";
import { Step4Print } from "./components/Step4Print";
import "./ProductApp.css";
import { SessionProvider, useSession } from "./state/sessionContext";

function ProductAppContent() {
  const { state, resetSession } = useSession();
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // E07 / FRD F8.4: Beforeunload warning when data exists in session
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasData = state.employees.length > 0 || state.photos.length > 0;
      if (hasData) {
        e.preventDefault();
        e.returnValue = "작업 중인 내용이 저장되지 않고 사라집니다. 페이지를 벗어나시겠습니까?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [state.employees.length, state.photos.length]);

  const handleConfirmReset = () => {
    resetSession();
    setIsResetModalOpen(false);
  };

  return (
    <div className="product-app-shell">
      <HeaderNav onRequestReset={() => setIsResetModalOpen(true)} />

      <main className="product-main-content">
        {state.step === 1 && <Step1Employees />}
        {state.step === 2 && <Step2Matching />}
        {state.step === 3 && <Step3Editor />}
        {state.step === 4 && <Step4Print />}
      </main>

      <footer className="product-footer">
        <div className="footer-content">
          <p className="footer-text">
            조직보드 사진 제작 자동화 웹페이지 · A4 가로 21명(7열×3행) 25×38mm 표준 규격 지원
          </p>
          <p className="footer-privacy">
            🔒 개인정보 보호: 직원 정보 및 사진은 서버로 전송되지 않으며, 현재 브라우저 탭 세션 메모리에서만 사용됩니다.
          </p>
        </div>
      </footer>

      <ResetModal
        isOpen={isResetModalOpen}
        onCancel={() => setIsResetModalOpen(false)}
        onConfirm={handleConfirmReset}
      />
    </div>
  );
}

/**
 * Default export of the main Product Application
 * Enforces in-memory session boundary and cleanup.
 */
export default function ProductApp() {
  return (
    <SessionProvider>
      <ProductAppContent />
    </SessionProvider>
  );
}
