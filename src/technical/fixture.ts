export interface SyntheticFixtureRow {
  readonly fixtureId: `fixture-${string}`;
  readonly displayName: `합성 인물 ${string}`;
  readonly jobCategory: "합성 직군";
  readonly contractType: "합성 계약";
}

export interface SyntheticFixture {
  readonly synthetic: true;
  readonly purpose: "technical-test-only";
  readonly rows: readonly SyntheticFixtureRow[];
}

export const syntheticFixture: SyntheticFixture = {
  synthetic: true,
  purpose: "technical-test-only",
  rows: [
    {
      fixtureId: "fixture-001",
      displayName: "합성 인물 001",
      jobCategory: "합성 직군",
      contractType: "합성 계약",
    },
    {
      fixtureId: "fixture-002",
      displayName: "합성 인물 002",
      jobCategory: "합성 직군",
      contractType: "합성 계약",
    },
  ],
};

export function validateSyntheticFixture(fixture: SyntheticFixture): string[] {
  const problems: string[] = [];

  if (!fixture.synthetic || fixture.purpose !== "technical-test-only") {
    problems.push("합성 데이터 표지가 없습니다.");
  }

  if (fixture.rows.length === 0) {
    problems.push("합성 행이 없습니다.");
  }

  const fixtureIds = new Set<string>();
  fixture.rows.forEach((row, index) => {
    if (!row.fixtureId.startsWith("fixture-")) {
      problems.push(`${index + 1}번 행의 fixture ID가 안전한 형식이 아닙니다.`);
    }
    if (!row.displayName.startsWith("합성 인물 ")) {
      problems.push(`${index + 1}번 행이 합성 이름임을 명시하지 않습니다.`);
    }
    if (fixtureIds.has(row.fixtureId)) {
      problems.push(`${index + 1}번 행의 fixture ID가 중복됩니다.`);
    }
    fixtureIds.add(row.fixtureId);
  });

  return problems;
}
