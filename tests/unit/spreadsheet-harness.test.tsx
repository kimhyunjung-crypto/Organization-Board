import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SpreadsheetHarness } from "../../src/technical/spreadsheet/SpreadsheetHarness";
import type { SpreadsheetAcceptedResult } from "../../src/technical/spreadsheet/types";

function accepted(batchId: string): SpreadsheetAcceptedResult {
  return {
    status: "accepted",
    batchId,
    validRows: [{ sourceRow: 2, name: "합성 인물 001", jobCategory: "QA", contractType: "인턴" }],
    invalidRows: [{ sourceRow: 3, column: "이름", code: "FORMULA_NOT_ALLOWED" }],
    warnings: [],
    summary: { totalDataRows: 2, ignoredEmptyRows: 0, validRows: 1, invalidRows: 1 },
  };
}

describe("SpreadsheetHarness", () => {
  it("keeps a successful summary when a later retry fails and never renders cell values", async () => {
    const user = userEvent.setup();
    const parseFile = vi.fn()
      .mockImplementationOnce(async (_file: File, options: { batchId: string }) => accepted(options.batchId))
      .mockImplementationOnce(async (_file: File, options: { batchId: string }) => ({
        status: "rejected",
        batchId: options.batchId,
        error: { code: "INVALID_XLSX" },
      }));
    render(<SpreadsheetHarness parseFile={parseFile} />);

    await user.upload(screen.getByTestId("spreadsheet-file"), new File(["synthetic"], "synthetic.xlsx"));
    await user.click(screen.getByRole("button", { name: "파서 시험 실행" }));
    expect(await screen.findByTestId("spreadsheet-summary")).toHaveTextContent("정상 행1");

    await user.click(screen.getByRole("button", { name: "같은 배치 다시 시험" }));
    expect(await screen.findByTestId("spreadsheet-error")).toHaveTextContent("이전 정상 배치 결과는 유지했습니다.");
    expect(screen.getByTestId("spreadsheet-summary")).toHaveTextContent("정상 행1");
    expect(document.body).not.toHaveTextContent("합성 인물 001");
  });
});
