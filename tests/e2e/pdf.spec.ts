import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const execFileAsync = promisify(execFile);

test.describe("S00.04 Technical PDF & Print Spike Harness", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?spike=pdf");
    // Wait for NanumGothic font to load
    await expect(page.locator('[data-testid="font-status"]')).toContainText(
      "NanumGothic-ExtraBold TTF 및 @pdf-lib/fontkit 엔진 로드 완료",
      { timeout: 15_000 },
    );
  });

  test("loads PDF spike at /?spike=pdf and displays calibration notice", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("조직보드 인쇄 & PDF 스파이크 Harness");
    await expect(page.locator(".calibration-notice")).toContainText("25 × 38 mm (허용 오차 ±0.5 mm)");
    await expect(page.locator(".calibration-notice")).toContainText("이름 영역 7.8mm");
    await expect(page.locator(".calibration-notice")).toContainText("실제 크기(100%)");
  });

  test("evaluates interactive name layout rules (TRD §9.3)", async ({ page }) => {
    const nameInput = page.locator('[data-testid="name-input"]');
    const fitsStatus = page.locator('[data-testid="layout-fits-status"]');

    // 1. 12pt single line: "홍길동"
    await nameInput.fill("홍길동");
    await expect(fitsStatus).toContainText("PASS (출력 가능)");
    await expect(page.locator('[data-testid="layout-metrics"]')).toContainText("글자 크기: 12 pt");
    await expect(page.locator('[data-testid="layout-metrics"]')).toContainText("줄 수: 1 줄");

    // 2. 10pt two lines (space split): "김철수 연구원"
    await nameInput.fill("김철수 연구원");
    await expect(fitsStatus).toContainText("PASS (출력 가능)");
    await expect(page.locator('[data-testid="layout-metrics"]')).toContainText("글자 크기: 10 pt");
    await expect(page.locator('[data-testid="layout-metrics"]')).toContainText("줄 수: 2 줄");
    await expect(page.locator('[data-testid="layout-metrics"]')).toContainText('Line 1: "김철수"');
    await expect(page.locator('[data-testid="layout-metrics"]')).toContainText('Line 2: "연구원"');

    // 3. 10pt two lines (grapheme minimax split): "알렉산더피터슨"
    await nameInput.fill("알렉산더피터슨");
    await expect(fitsStatus).toContainText("PASS (출력 가능)");
    await expect(page.locator('[data-testid="layout-metrics"]')).toContainText("글자 크기: 10 pt");
    await expect(page.locator('[data-testid="layout-metrics"]')).toContainText("줄 수: 2 줄");
    await expect(page.locator('[data-testid="layout-metrics"]')).toContainText('Line 1: "알렉산"');
    await expect(page.locator('[data-testid="layout-metrics"]')).toContainText('Line 2: "더피터슨"');

    // 4. Missing glyph rejection: Japanese "田中 太郎"
    await nameInput.fill("田中 太郎");
    await expect(fitsStatus).toContainText("BLOCKED (MISSING_GLYPH)");
    await expect(page.locator('[data-testid="layout-error-message"]')).toContainText(
      "글꼴에 지원되지 않는 문자가 포함되어 있습니다",
    );

    // 5. Missing glyph rejection: Emoji "홍길동 😊"
    await nameInput.fill("홍길동 😊");
    await expect(fitsStatus).toContainText("BLOCKED (MISSING_GLYPH)");
    await expect(page.locator('[data-testid="layout-error-message"]')).toContainText(
      "글꼴에 지원되지 않는 문자가 포함되어 있습니다",
    );

    // 6. Name overflow rejection: Super long string
    await nameInput.fill("Supercalifragilisticexpialidocious Longname Extra");
    await expect(fitsStatus).toContainText("BLOCKED (NAME_OVERFLOW)");
    await expect(page.locator('[data-testid="layout-error-message"]')).toContainText(
      "초과하여 출력할 수 없습니다",
    );
  });

  test("renders card preview on Canvas at 300 ppi with valid pixels", async ({ page }) => {
    const canvas = page.locator('[data-testid="card-preview-canvas"]');
    await expect(canvas).toBeVisible();

    // Verify 300 ppi pixel dimensions: 25 × 38 mm -> 295 × 449 px
    const width = await canvas.evaluate((el: HTMLCanvasElement) => el.width);
    const height = await canvas.evaluate((el: HTMLCanvasElement) => el.height);
    expect(width).toBe(295);
    expect(height).toBe(449);

    // Verify canvas is painted (has non-white/non-transparent pixels)
    const hasInk = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext("2d");
      if (!ctx) return false;
      const data = ctx.getImageData(0, 0, el.width, el.height).data;
      let nonWhite = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        if (r < 250 || g < 250 || b < 250) {
          nonWhite++;
        }
      }
      return nonWhite > 1000;
    });
    expect(hasInk).toBe(true);
  });

  test("downloads calibration PDF and passes PyMuPDF independent inspection", async ({ page }) => {
    const downloadBtn = page.locator('[data-testid="download-calibration-pdf-btn"]');
    await expect(downloadBtn).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      downloadBtn.click(),
    ]);

    expect(download.suggestedFilename()).toBe("org-board-print-calibration.pdf");

    const tmpDir = path.resolve(process.cwd(), "tmp", "pdfs");
    await mkdir(tmpDir, { recursive: true });
    const downloadPath = path.resolve(tmpDir, "e2e-downloaded.pdf");

    const tempPath = await download.path();
    if (!tempPath) {
      throw new Error("다운로드 경로를 찾을 수 없습니다.");
    }
    const bytes = await readFile(tempPath);
    await writeFile(downloadPath, bytes);

    // Check PDF header
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    const header = Buffer.from(bytes.slice(0, 5)).toString("ascii");
    expect(header).toBe("%PDF-");

    // Run independent PyMuPDF inspection
    const inspectScript = path.resolve(process.cwd(), "scripts", "inspect-print-pdf.py");
    const { stdout } = await execFileAsync("python", [inspectScript, downloadPath]);
    const report = JSON.parse(stdout);
    expect(report.pass).toBe(true);
    expect(report.errors).toHaveLength(0);
    expect(report.pages).toBe(2);
  });

  test("allows selecting any of the 22 synthetic cards to update preview", async ({ page }) => {
    // Select card #22 (문건우, QA 계약직)
    const slot22 = page.locator(".mini-card-slot").nth(21);
    await slot22.click();

    await expect(page.locator('[data-testid="name-input"]')).toHaveValue("문건우");
    await expect(page.locator("#job-select")).toHaveValue("QA");
    await expect(page.locator("#contract-select")).toHaveValue("계약직");
  });
});
