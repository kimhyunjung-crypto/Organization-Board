import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const execFileAsync = promisify(execFile);

async function main() {
  console.log("Starting S00.04 calibration PDF generator...");

  const port = 5178;
  const server = await createServer({
    server: {
      port,
      host: "127.0.0.1",
      watch: {
        ignored: ["**/output/**", "**/tmp/**"],
      },
    },
  });
  await server.listen();
  console.log(`Vite server listening on http://127.0.0.1:${port}`);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/?spike=pdf`);

    // Wait for font to be loaded
    await page.waitForSelector('[data-testid="font-status"]:has-text("NanumGothic-ExtraBold TTF")', {
      timeout: 10_000,
    });
    console.log("NanumGothic font confirmed loaded in browser.");

    // Trigger download of calibration PDF
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.click('[data-testid="download-calibration-pdf-btn"]'),
    ]);

    const suggestedFilename = download.suggestedFilename();
    console.log(`Received download stream: ${suggestedFilename}`);

    const outputPath = path.resolve(process.cwd(), "output", "pdf", "org-board-print-calibration.pdf");
    const tmpPath = path.resolve(process.cwd(), "tmp", "pdfs", "org-board-print-calibration.pdf");

    await mkdir(path.dirname(outputPath), { recursive: true });
    await mkdir(path.dirname(tmpPath), { recursive: true });

    const tempDownloadPath = await download.path();
    if (!tempDownloadPath) {
      throw new Error("다운로드 임시 경로를 가져올 수 없습니다.");
    }
    const { readFile } = await import("node:fs/promises");
    const pdfBytes = await readFile(tempDownloadPath);

    await writeFile(outputPath, pdfBytes);
    await writeFile(tmpPath, pdfBytes);

    console.log(`✓ Saved calibration PDF to: ${outputPath}`);
    console.log(`✓ Saved copy to: ${tmpPath}`);

    // Run independent PyMuPDF inspection
    console.log("\nRunning independent PyMuPDF inspection (scripts/inspect-print-pdf.py)...");
    try {
      const { stdout, stderr } = await execFileAsync("python", ["scripts/inspect-print-pdf.py", outputPath]);
      console.log("Inspection STDOUT:", stdout);
      if (stderr) console.warn("Inspection STDERR:", stderr);
      console.log("✓ PyMuPDF independent inspection PASSED!");
    } catch (err) {
      console.error("PyMuPDF inspection FAILED:", err);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error("Fatal error generating calibration PDF:", err);
  process.exit(1);
});
