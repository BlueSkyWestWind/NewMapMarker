import { describe, expect, it } from "vitest";
import { OPTION_LIST_KEYS } from "./day-types";
import { OPTION_LIST_LABELS, OPTION_LIST_SEEDS } from "./option-lists";

describe("OPTION_LIST_SEEDS", () => {
  it("목록마다 처음 값 개수가 스펙과 같다", () => {
    const counts = Object.fromEntries(
      OPTION_LIST_KEYS.map((key) => [key, OPTION_LIST_SEEDS[key].length]),
    );
    expect(counts).toEqual({
      bizClass: 13,
      bizKind: 6,
      constructionType: 5,
      workCategory: 12,
      workTime: 2,
      workType: 9,
      equipment: 17,
      workContent: 7,
    });
  });

  it("작업구분은 HW로 시작하고 작업시간은 주간·야간이다", () => {
    expect(OPTION_LIST_SEEDS.workCategory[0]).toBe("HW");
    expect(OPTION_LIST_SEEDS.workTime).toEqual(["주간", "야간"]);
  });

  it("중장비투입의 쉼표 조합은 한 항목이다", () => {
    expect(OPTION_LIST_SEEDS.equipment).toContain("이동식크레인,굴착기");
    expect(OPTION_LIST_SEEDS.equipment).not.toContain("굴착기,이동식크레인");
  });

  it("모든 목록에 중복이 없다", () => {
    for (const key of OPTION_LIST_KEYS) {
      const values = OPTION_LIST_SEEDS[key];
      expect(new Set(values).size, key).toBe(values.length);
    }
  });

  it("모든 목록에 한글 이름이 있다", () => {
    for (const key of OPTION_LIST_KEYS) {
      expect(OPTION_LIST_LABELS[key].length, key).toBeGreaterThan(0);
    }
  });
});
