import syntheticPortraitUrl from "../../../tests/fixtures/images/synthetic-portrait.png?url";
import { computeCoverCrop } from "../imaging/crop";
import type { CropRect } from "../imaging/types";
import type { EmployeeCardInput } from "./renderPlan";

export const SYNTHETIC_IMAGE_URL = syntheticPortraitUrl;

// Dimensions of synthetic-portrait.png: 1254 × 1254 px
export const SYNTHETIC_IMAGE_WIDTH = 1254;
export const SYNTHETIC_IMAGE_HEIGHT = 1254;

export const DEFAULT_SYNTHETIC_CROP: CropRect = computeCoverCrop(
  SYNTHETIC_IMAGE_WIDTH,
  SYNTHETIC_IMAGE_HEIGHT,
);

/**
 * 22 Synthetic cards spanning:
 * - 5 Job categories: 디자인, 서비스, 개발, 백오피스, QA
 * - 5 Contract types: 정규직, 계약직, 아르바이트, 파견직, 인턴
 * - 1-line 12pt names (3, 4, 5 chars, English)
 * - 2-line 10pt names (space-split, grapheme-split)
 * - Page 1: 21 cards (slots 0..20)
 * - Page 2: 1 card (slot 0)
 */
export const SYNTHETIC_CALIBRATION_CARDS: readonly EmployeeCardInput[] = [
  {
    employeeId: "syn-01",
    name: "김민준",
    jobCategory: "디자인",
    contractType: "정규직",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-02",
    name: "이서연",
    jobCategory: "디자인",
    contractType: "계약직",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-03",
    name: "박도윤",
    jobCategory: "디자인",
    contractType: "아르바이트",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-04",
    name: "최예은",
    jobCategory: "디자인",
    contractType: "파견직",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-05",
    name: "정시우",
    jobCategory: "디자인",
    contractType: "인턴",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-06",
    name: "강하은",
    jobCategory: "서비스",
    contractType: "정규직",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-07",
    name: "조지호",
    jobCategory: "서비스",
    contractType: "계약직",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-08",
    name: "윤수아",
    jobCategory: "서비스",
    contractType: "아르바이트",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-09",
    name: "장준우",
    jobCategory: "서비스",
    contractType: "파견직",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-10",
    name: "임지안",
    jobCategory: "서비스",
    contractType: "인턴",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-11",
    name: "한도현",
    jobCategory: "개발",
    contractType: "정규직",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-12",
    name: "오서아",
    jobCategory: "개발",
    contractType: "계약직",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-13",
    name: "남궁민수",
    jobCategory: "개발",
    contractType: "아르바이트",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-14",
    name: "황보선생님",
    jobCategory: "개발",
    contractType: "파견직",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-15",
    name: "김철수 연구원",
    jobCategory: "개발",
    contractType: "인턴",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-16",
    name: "알렉산더피터슨",
    jobCategory: "백오피스",
    contractType: "정규직",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-17",
    name: "송지우",
    jobCategory: "백오피스",
    contractType: "계약직",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-18",
    name: "배서진",
    jobCategory: "백오피스",
    contractType: "아르바이트",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-19",
    name: "John Smith",
    jobCategory: "백오피스",
    contractType: "파견직",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    employeeId: "syn-20",
    name: "Alex Hamilton",
    jobCategory: "백오피스",
    contractType: "인턴",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    // Slot 20: 21st card, last card of page 1
    employeeId: "syn-21",
    name: "유하린",
    jobCategory: "QA",
    contractType: "정규직",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
  {
    // Slot 0: 22nd card, only card of page 2
    employeeId: "syn-22",
    name: "문건우",
    jobCategory: "QA",
    contractType: "계약직",
    photoCrop: DEFAULT_SYNTHETIC_CROP,
    photoSourceUrl: SYNTHETIC_IMAGE_URL,
  },
];

export const NEGATIVE_TEST_NAMES = {
  EMPTY: "   ",
  JAPANESE: "田中 太郎",
  EMOJI: "홍길동 😊",
  OVERFLOW: "Supercalifragilisticexpialidocious Longname",
} as const;
