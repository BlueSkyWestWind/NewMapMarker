import { describe, expect, it } from "vitest";
import { MAX_ROWS } from "./cell-grid";
import { crossTeamBlockReason, planCrossTeamCreate } from "./cross-team";
import type { ScheduleCell } from "@/features/schedule/types";

const D = "2026-11-09";

function cell(columnId: string, rowNo: number, mainText: string, subText = ""): ScheduleCell {
  return { id: `${columnId}-${rowNo}`, workDate: D, columnId, rowNo, mainText, subText, textColor: null };
}

const entry = (mainText: string, noCompanion = false) => ({
  mainText,
  subText: "",
  textColor: null,
  noCompanion,
});

describe("planCrossTeamCreate", () => {
  it("두 팀 모두 마지막 일정 아래 빈 행에 순서대로 배정하고 noCompanion을 복사한다", () => {
    const plan = planCrossTeamCreate({
      cells: [cell("a", 0, "기존A"), cell("a", 1, "", "입회 : 홍길동"), cell("b", 0, "기존B")],
      workDate: D,
      targetColumnIds: ["a", "b"],
      entries: [entry("국소1", true), entry("국소2")],
    });
    expect(plan.skipped).toEqual([]);
    expect(
      plan.creates.map((c) => [c.columnId, c.position.rowNo, c.text.mainText, c.text.noCompanion]),
    ).toEqual([
      // a팀은 입회 칸(1행)이 있어도 일정 목록의 마지막(0행) 바로 아래부터 빈 행을 찾는다.
      ["a", 2, "국소1", true],
      ["a", 3, "국소2", undefined],
      ["b", 1, "국소1", true],
      ["b", 2, "국소2", undefined],
    ]);
  });

  it("행이 가득 찬 팀만 full로 건너뛰고 다른 팀은 배정한다", () => {
    const full = Array.from({ length: MAX_ROWS }, (_, i) => cell("a", i, `기존${i}`));
    const plan = planCrossTeamCreate({
      cells: full,
      workDate: D,
      targetColumnIds: ["a", "b"],
      entries: [entry("국소1")],
    });
    expect(plan.skipped).toEqual([{ columnId: "a", reason: "full", mainText: "국소1" }]);
    expect(plan.creates.map((c) => c.columnId)).toEqual(["b"]);
  });

  it("같은 국소가 이미 있으면 공백·대소문자를 무시하고 duplicate로 건너뛴다", () => {
    const plan = planCrossTeamCreate({
      cells: [cell("a", 0, "Seoul Site-RRU")],
      workDate: D,
      targetColumnIds: ["a", "b"],
      entries: [entry("seoulsite-rru")],
    });
    expect(plan.skipped).toEqual([{ columnId: "a", reason: "duplicate", mainText: "seoulsite-rru" }]);
    expect(plan.creates.map((c) => c.columnId)).toEqual(["b"]);
  });

  it("대상 팀이 없으면 연산이 없다", () => {
    expect(
      planCrossTeamCreate({ cells: [], workDate: D, targetColumnIds: [], entries: [entry("가")] }),
    ).toEqual({ creates: [], skipped: [] });
  });

  it("빈 mainText 항목은 무시하고, 같은 팀 id가 겹쳐도 한 번만 처리한다", () => {
    const plan = planCrossTeamCreate({
      cells: [],
      workDate: D,
      targetColumnIds: ["a", "a"],
      entries: [entry("  "), entry("가")],
    });
    expect(plan.creates).toHaveLength(1);
    expect(plan.skipped).toEqual([]);
  });

  it("다른 날짜의 칸은 행 점유로 세지 않는다", () => {
    const other: ScheduleCell = { ...cell("a", 0, "다른날"), workDate: "2026-11-10" };
    const plan = planCrossTeamCreate({
      cells: [other],
      workDate: D,
      targetColumnIds: ["a"],
      entries: [entry("가")],
    });
    expect(plan.creates[0].position.rowNo).toBe(0);
  });
});

describe("crossTeamBlockReason", () => {
  const withText = [entry("가")];

  it("함께 등록할 팀을 고르지 않았으면 막을 이유가 없다", () => {
    expect(crossTeamBlockReason({ moving: true, crossTeamCount: 0, newEntries: [entry("")] })).toBeNull();
  });

  it("날짜·팀을 바꾸는 저장과는 함께 쓸 수 없다", () => {
    expect(crossTeamBlockReason({ moving: true, crossTeamCount: 1, newEntries: withText })).toContain(
      "날짜",
    );
  });

  it("새 항목에 국소·작업 글이 없으면 함께 등록할 수 없다(메모만 있는 항목이 조용히 빠지지 않게)", () => {
    expect(
      crossTeamBlockReason({
        moving: false,
        crossTeamCount: 1,
        newEntries: [{ ...entry(""), subText: "메모만" }],
      }),
    ).toContain("국소");
  });

  it("조건이 맞으면 null이다", () => {
    expect(crossTeamBlockReason({ moving: false, crossTeamCount: 2, newEntries: withText })).toBeNull();
  });
});
