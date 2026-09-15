import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./app.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("기술 시험 화면을 시작할 루트 요소가 없습니다.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
