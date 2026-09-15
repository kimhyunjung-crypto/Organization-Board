import { expect, test } from "@playwright/test";

test("localhost에서 기술 시험 harness와 로컬 자산 준비 상태를 확인한다", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      externalRequests.push(request.url());
    }
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "조직보드 기술 시험 Harness" })).toBeVisible();
  await expect(page.getByText("2개 합성 행 검증 완료")).toBeVisible();
  await expect(page.getByTestId("asset-summary")).toHaveText("폰트·모델·WASM 준비 완료", {
    timeout: 30_000,
  });
  expect(externalRequests).toEqual([]);
});
