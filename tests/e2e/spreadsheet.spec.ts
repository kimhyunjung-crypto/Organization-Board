import { expect, test } from "@playwright/test";
import { createMixedSyntheticWorkbook } from "../fixtures/spreadsheets/buildSyntheticWorkbook";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

test("실제 브라우저 Worker가 첫 표시 시트의 혼합 행을 구조화한다", async ({ page }) => {
  await page.goto("/?spike=spreadsheet");
  await expect(page.getByRole("heading", { level: 1, name: "XLSX 파서 기술 시험" })).toBeVisible();

  const bytes = await createMixedSyntheticWorkbook();
  await page.getByTestId("spreadsheet-file").setInputFiles({
    name: "synthetic-mixed.xlsx",
    mimeType: XLSX_MIME,
    buffer: Buffer.from(bytes),
  });
  await page.getByRole("button", { name: "파서 시험 실행" }).click();

  const summary = page.getByTestId("spreadsheet-summary");
  await expect(summary).toContainText("정상 행3");
  await expect(summary).toContainText("오류 행3");
  await expect(page.getByText("3행 · 이름")).toBeVisible();
  await expect(page.getByText(/FORMULA_NOT_ALLOWED/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText("1+1");
  await expect(page.locator("body")).not.toContainText("example.invalid");
});

test("손상 파일 실패와 실제 10초 종료 후에도 이전 배치 결과를 유지한다", async ({ page }) => {
  await page.goto("/?spike=spreadsheet");
  const bytes = await createMixedSyntheticWorkbook();
  const fileInput = page.getByTestId("spreadsheet-file");

  await fileInput.setInputFiles({ name: "synthetic-valid.xlsx", mimeType: XLSX_MIME, buffer: Buffer.from(bytes) });
  await page.getByRole("button", { name: "파서 시험 실행" }).click();
  await expect(page.getByTestId("integrated-valid-count")).toHaveText("누적 정상 3행");

  await fileInput.setInputFiles({
    name: "synthetic-corrupt.xlsx",
    mimeType: XLSX_MIME,
    buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]),
  });
  await page.getByRole("button", { name: "파서 시험 실행" }).click();
  await expect(page.getByTestId("spreadsheet-error")).toContainText("INVALID_XLSX");
  await expect(page.getByTestId("integrated-valid-count")).toHaveText("누적 정상 3행");

  await fileInput.setInputFiles({ name: "synthetic-timeout.xlsx", mimeType: XLSX_MIME, buffer: Buffer.from(bytes) });
  await page.getByRole("button", { name: "10초 종료 시험" }).click();
  await expect(page.getByTestId("spreadsheet-error")).toContainText("WORKER_TIMEOUT", { timeout: 12_000 });
  await expect(page.getByTestId("spreadsheet-error")).toContainText("이전 정상 배치 결과는 유지했습니다.");
  await expect(page.getByTestId("integrated-valid-count")).toHaveText("누적 정상 3행");
});
