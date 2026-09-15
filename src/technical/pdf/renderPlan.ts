import { resolveChipColor } from "./colors";
import { DEFAULT_CARD_RECTS, PAGE_CONSTANTS } from "./constants";
import type { FontkitFont } from "./fontLoader";
import { computeNameLayout } from "./nameLayout";
import type {
  CardRenderPlan,
  ContractType,
  DocumentRenderPlan,
  JobCategory,
  PagePosition,
} from "./types";
import type { CropRect } from "../imaging/types";

export interface EmployeeCardInput {
  readonly employeeId: string;
  readonly name: string;
  readonly jobCategory: JobCategory;
  readonly contractType: ContractType;
  readonly photoCrop: CropRect;
  readonly photoSourceUrl?: string;
  readonly photoRevision?: number;
}

export function computePagePosition(index: number): PagePosition {
  const pageIndex = Math.floor(index / PAGE_CONSTANTS.SLOTS_PER_PAGE);
  const slotIndex = index % PAGE_CONSTANTS.SLOTS_PER_PAGE;
  const column = slotIndex % PAGE_CONSTANTS.COLUMNS;
  const row = Math.floor(slotIndex / PAGE_CONSTANTS.COLUMNS);
  const xMm = PAGE_CONSTANTS.ORIGIN_X_MM + column * PAGE_CONSTANTS.STEP_X_MM;
  const yMm = PAGE_CONSTANTS.ORIGIN_Y_MM + row * PAGE_CONSTANTS.STEP_Y_MM;

  return {
    pageIndex,
    slotIndex,
    column,
    row,
    xMm,
    yMm,
  };
}

export function buildCardRenderPlan(
  input: EmployeeCardInput,
  index: number,
  font: FontkitFont,
): CardRenderPlan {
  const pagePosition = computePagePosition(index);
  const chipColor = resolveChipColor(input.jobCategory, input.contractType);
  const nameLayout = computeNameLayout(input.name, font);

  return {
    employeeId: input.employeeId,
    name: input.name,
    jobCategory: input.jobCategory,
    contractType: input.contractType,
    chipColorHex: chipColor.hex,
    chipColorRgb: chipColor.rgb,
    photoRevision: input.photoRevision ?? 1,
    photoCrop: input.photoCrop,
    photoSourceUrl: input.photoSourceUrl,
    nameLayout,
    pagePosition,
    rects: DEFAULT_CARD_RECTS,
  };
}

export function buildDocumentRenderPlan(
  employees: readonly EmployeeCardInput[],
  font: FontkitFont,
): DocumentRenderPlan {
  const totalEmployees = employees.length;
  const blockingIssues: string[] = [];

  if (totalEmployees === 0) {
    return {
      totalEmployees: 0,
      totalPages: 0,
      cards: [],
      blockingIssues: ["출력할 직원이 0명입니다. 최소 1명 이상이어야 PDF를 생성할 수 있습니다."],
      isBlocked: true,
    };
  }

  const totalPages = Math.ceil(totalEmployees / PAGE_CONSTANTS.SLOTS_PER_PAGE);
  const cards: CardRenderPlan[] = [];

  for (let i = 0; i < totalEmployees; i++) {
    const emp = employees[i]!;
    const cardPlan = buildCardRenderPlan(emp, i, font);
    cards.push(cardPlan);

    if (!cardPlan.nameLayout.fits) {
      blockingIssues.push(
        `[직원 #${i + 1} ${emp.name}] ${cardPlan.nameLayout.errorMessage ?? "이름 배치 오류"}`,
      );
    }
  }

  return {
    totalEmployees,
    totalPages,
    cards,
    blockingIssues,
    isBlocked: blockingIssues.length > 0,
  };
}
