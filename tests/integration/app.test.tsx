import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../../src/App";

describe("S00.01 harness", () => {
  it("identifies its technical-test boundary and reports ready inputs", async () => {
    render(
      <App
        assetProbe={async () => ({
          ready: true,
          checks: [
            {
              path: "/assets/fonts/NanumGothic-ExtraBold.ttf",
              state: "ready",
              detail: "OFL-1.1 · SHA-256 확인",
            },
          ],
        })}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "조직보드 기술 시험 Harness" })).toBeInTheDocument();
    expect(screen.getByText(/제품 기능이 아닌 기술 시험용 최소 환경/)).toBeInTheDocument();
    expect(screen.getByText("2개 합성 행 검증 완료")).toBeInTheDocument();
    expect(await screen.findByText("폰트·모델·WASM 준비 완료")).toBeInTheDocument();
  });
});
