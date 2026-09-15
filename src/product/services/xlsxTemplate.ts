import ExcelJS from "exceljs";
import { ALLOWED_CONTRACT_TYPES, ALLOWED_JOB_CATEGORIES } from "../../technical/spreadsheet/types";

/**
 * Generates and downloads the official XLSX template for employee input.
 * In accordance with TRD §5.1 and FRD F2.8:
 * - First visible sheet: "직원정보입력" with headers [이름, 직군, 계약형태] and empty data rows
 * - Second guide sheet: "입력안내" with allowed values and synthetic example reference
 * - Real user data or PII is never included in the template
 */
export async function downloadXlsxTemplate(): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "조직보드 사진 제작 시스템";
  workbook.created = new Date();

  // 1. First visible sheet for direct input
  const inputSheet = workbook.addWorksheet("직원정보입력", {
    state: "visible",
    views: [{ state: "frozen", ySplit: 1 }],
  });

  inputSheet.columns = [
    { header: "이름", key: "name", width: 16 },
    { header: "직군", key: "jobCategory", width: 18 },
    { header: "계약형태", key: "contractType", width: 16 },
  ];

  // Header styling
  const headerRow = inputSheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2E5B88" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 24;

  // 2. Guide sheet with allowed options and instructions
  const guideSheet = workbook.addWorksheet("입력안내", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  guideSheet.columns = [
    { header: "구분", key: "section", width: 15 },
    { header: "항목 및 규칙", key: "content", width: 50 },
    { header: "허용 값 목록 (정확히 일치 필요)", key: "allowedValues", width: 45 },
  ];

  const guideHeaderRow = guideSheet.getRow(1);
  guideHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  guideHeaderRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF444444" },
  };
  guideHeaderRow.alignment = { vertical: "middle", horizontal: "center" };
  guideHeaderRow.height = 24;

  guideSheet.addRow({
    section: "필수 열 안내",
    content: "첫 번째 '직원정보입력' 시트에 입력하며, 열 이름은 변경하지 마세요.",
    allowedValues: "이름, 직군, 계약형태",
  });

  guideSheet.addRow({
    section: "이름",
    content: "공백만 입력할 수 없으며, 사진 파일명과 일치하면 자동 매칭됩니다.",
    allowedValues: "예: 김현정 (영문, 한글 모두 가능)",
  });

  guideSheet.addRow({
    section: "직군",
    content: "조직보드 컬러칩 기본 색상을 결정합니다.",
    allowedValues: ALLOWED_JOB_CATEGORIES.join(", "),
  });

  guideSheet.addRow({
    section: "계약형태",
    content: "계약형태 전용 컬러가 직군보다 우선 적용됩니다 (정규직은 직군색 사용).",
    allowedValues: ALLOWED_CONTRACT_TYPES.join(", "),
  });

  guideSheet.addRow({
    section: "참고 사항",
    content: "수식, 셀 병합, 빈 행, 오류 셀은 지원되지 않으며 행 오류로 표시됩니다.",
    allowedValues: "정상 행만 선택적으로 가져오실 수 있습니다.",
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "조직보드_직원정보_양식.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
