import { describe, expect, it } from "vitest";
import { syntheticFixture, validateSyntheticFixture, type SyntheticFixture } from "../../src/technical/fixture";

describe("synthetic fixture guard", () => {
  it("accepts the clearly labelled default fixture", () => {
    expect(validateSyntheticFixture(syntheticFixture)).toEqual([]);
  });

  it("rejects duplicate IDs and rows without a synthetic name marker", () => {
    const invalidFixture = {
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
          fixtureId: "fixture-001",
          displayName: "실제처럼 보이는 이름",
          jobCategory: "합성 직군",
          contractType: "합성 계약",
        },
      ],
    } as SyntheticFixture;

    expect(validateSyntheticFixture(invalidFixture)).toEqual([
      "2번 행이 합성 이름임을 명시하지 않습니다.",
      "2번 행의 fixture ID가 중복됩니다.",
    ]);
  });
});
