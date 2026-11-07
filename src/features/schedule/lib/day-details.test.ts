import { describe, expect, it } from "vitest";
import { mergeDetailPatch } from "./day-details";
import type { DayDetail } from "./day-types";

const KEY = { workDate: "2026-11-09", stationKey: "a국소", site: "A 국소" };

function detail(overrides: Partial<DayDetail> = {}): DayDetail {
  return {
    ...KEY,
    workCategory: null,
    levelLabel: null,
    workTime: null,
    workType: null,
    equipment: null,
    workContent: null,
    workDetail: null,
    worker: null,
    witness: null,
    signaler: null,
    overrides: {},
    ...overrides,
  };
}

describe("mergeDetailPatch", () => {
  it("기존 행이 없으면 모든 칸이 null인 빈 행에 패치를 얹는다", () => {
    expect(mergeDetailPatch(undefined, KEY, { workTime: "야간" })).toEqual(detail({ workTime: "야간" }));
  });

  it("패치에 없는 칸(undefined 포함)은 기존 값을 그대로 둔다", () => {
    const base = detail({ workType: "실외", equipment: "굴착기", workDetail: "상세" });
    const merged = mergeDetailPatch(base, KEY, { workTime: "야간", workType: undefined });
    expect(merged.workType).toBe("실외");
    expect(merged.equipment).toBe("굴착기");
    expect(merged.workDetail).toBe("상세");
    expect(merged.workTime).toBe("야간");
  });

  it("빈 글은 빈 글로 덮어쓰고 null은 null로 되돌린다(둘을 섞지 않는다)", () => {
    const base = detail({ workType: "실외", worker: "홍길동", witness: "김입회" });
    const merged = mergeDetailPatch(base, KEY, { workType: "", worker: null });
    expect(merged.workType).toBe("");
    expect(merged.worker).toBeNull();
    expect(merged.witness).toBe("김입회");
  });

  it("overrides는 키별로 합친다: 새 키 추가, 같은 키 교체, 빈 글 키는 지우고, 패치에 없는 키는 둔다", () => {
    const base = detail({ overrides: { project: "예전", address: "주소", region: "지역" } });
    const merged = mergeDetailPatch(base, KEY, {
      overrides: { project: "새것", facilityCode: "F-1", address: "" },
    });
    expect(merged.overrides).toEqual({ project: "새것", region: "지역", facilityCode: "F-1" });
  });

  it("패치에 overrides가 없으면 기존 overrides를 그대로 둔다", () => {
    const base = detail({ overrides: { project: "P" } });
    expect(mergeDetailPatch(base, KEY, { workTime: "주간" }).overrides).toEqual({ project: "P" });
  });

  it("기존 행의 overrides 객체와 패치 객체를 바꾸지 않는다", () => {
    const base = detail({ overrides: { project: "P" } });
    const patch = { overrides: { region: "R" } };
    mergeDetailPatch(base, KEY, patch);
    expect(base.overrides).toEqual({ project: "P" });
    expect(patch.overrides).toEqual({ region: "R" });
  });

  it("행 식별(날짜·국소 키·국소명)은 key 인자를 쓴다", () => {
    const base = detail({ site: "예전 표기" });
    expect(mergeDetailPatch(base, KEY, {})).toMatchObject(KEY);
  });
});
