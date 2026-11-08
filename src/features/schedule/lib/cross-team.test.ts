import { describe, expect, it } from "vitest";
import { MAX_ROWS } from "./cell-grid";
import { crossTeamBlockReason, planCrossTeamCreate } from "./cross-team";
import type { ScheduleCell } from "@/features/schedule/types";

const D = "2026-11-09";

function cell(columnId: string, rowNo: number, mainText: string, subText = ""): ScheduleCell {
  return { id: `${columnId}-${rowNo}`, workDate: D, columnId, rowNo, mainText, subText, textColor: null };
}

const entry = (mainText: string, companionTarget = false) => ({
  mainText,
  subText: "",
  textColor: null,
  companionTarget,
});

describe("planCrossTeamCreate", () => {
  it("두 팀 모두 마지막 일정 아래 빈 행에 순서대로 배정하고 companionTarget을 복사한다", () => {
    const plan = planCrossTeamCreate({
      cells: [cell("a", 0, "기존A"), cell("a", 1, "", "입회 : 홍길동"), cell("b", 0, "기존B")],
      workDate: D,
      targetColumnIds: ["a", "b"],
      entries: [entry("국소1", true), entry("국소2")],
    });
    expect(plan.skipped).toEqual([]);
    expect(
      plan.creates.map((c) => [c.columnId, c.position.rowNo, c.text.mainText, c.text.companionTarget]),
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
    expect(
      crossTeamBlockReason({ moving: true, crossTeamCount: 0, copyableCount: 0, newEntries: [entry("")] }),
    ).toBeNull();
  });

  it("날짜·팀을 바꾸는 저장과는 함께 쓸 수 없다", () => {
    expect(
      crossTeamBlockReason({ moving: true, crossTeamCount: 1, copyableCount: 1, newEntries: withText }),
    ).toContain("날짜");
  });

  it("팀을 골랐는데 복사할 국소가 목록에 하나도 없으면 안내한다(아무것도 안 들어갔는데 저장된 것처럼 보이지 않게)", () => {
    expect(
      crossTeamBlockReason({ moving: false, crossTeamCount: 3, copyableCount: 0, newEntries: [] }),
    ).toContain("목록");
  });

  it("새 항목에 국소·작업 글이 없으면 함께 등록할 수 없다(메모만 있는 항목이 조용히 빠지지 않게)", () => {
    expect(
      crossTeamBlockReason({
        moving: false,
        crossTeamCount: 1,
        copyableCount: 1,
        newEntries: [{ ...entry(""), subText: "메모만" }],
      }),
    ).toContain("국소");
  });

  it("조건이 맞으면 null이다", () => {
    expect(
      crossTeamBlockReason({ moving: false, crossTeamCount: 2, copyableCount: 1, newEntries: withText }),
    ).toBeNull();
  });
});

describe("planCrossTeamCreate 입회·신호수 복사", () => {
  const companions = [
    { kind: "입회" as const, names: "박황열" },
    { kind: "신호수" as const, names: "김철수, 이영희" },
  ];

  it("국소 칸 다음 빈 행에 입회·신호수 칸을 만든다", () => {
    const plan = planCrossTeamCreate({
      cells: [],
      workDate: D,
      targetColumnIds: ["a"],
      entries: [entry("국소1"), entry("국소2")],
      companions,
    });
    expect(plan.skipped).toEqual([]);
    expect(
      plan.creates.map((c) => [c.position.rowNo, c.text.mainText, c.text.subText]),
    ).toEqual([
      [0, "국소1", ""],
      [1, "국소2", ""],
      [2, "", "입회 : 박황열"],
      [3, "", "신호수 : 김철수, 이영희"],
    ]);
  });

  it("대상 팀에 이미 입회가 있으면 덮어쓰지 않고 duplicate로 알린다(신호수는 복사한다)", () => {
    const plan = planCrossTeamCreate({
      cells: [cell("a", 0, "", "입회 : 기존사람")],
      workDate: D,
      targetColumnIds: ["a"],
      entries: [entry("국소1")],
      companions,
    });
    expect(plan.skipped).toEqual([{ columnId: "a", reason: "duplicate", mainText: "입회" }]);
    expect(plan.creates.map((c) => c.text.subText)).toEqual(["", "신호수 : 김철수, 이영희"]);
  });

  it("국소가 모두 이미 있어도 입회·신호수는 복사한다(나중에 입회만 추가한 경우)", () => {
    const plan = planCrossTeamCreate({
      cells: [cell("a", 0, "국소1")],
      workDate: D,
      targetColumnIds: ["a"],
      entries: [entry("국소1")],
      companions,
    });
    expect(plan.skipped).toEqual([{ columnId: "a", reason: "duplicate", mainText: "국소1" }]);
    expect(plan.creates.map((c) => c.text.subText)).toEqual(["입회 : 박황열", "신호수 : 김철수, 이영희"]);
  });

  it("이름이 비어 있으면 종류만 적은 칸을 만든다", () => {
    const plan = planCrossTeamCreate({
      cells: [],
      workDate: D,
      targetColumnIds: ["a"],
      entries: [entry("국소1")],
      companions: [{ kind: "입회", names: "  " }],
    });
    expect(plan.creates.map((c) => c.text.subText)).toEqual(["", "입회"]);
  });

  it("companions를 주지 않으면 이전과 같다", () => {
    const plan = planCrossTeamCreate({
      cells: [],
      workDate: D,
      targetColumnIds: ["a"],
      entries: [entry("국소1")],
    });
    expect(plan.creates).toHaveLength(1);
  });

  it("행이 모자라면 입회·신호수도 full로 건너뛴다", () => {
    const full = Array.from({ length: MAX_ROWS - 1 }, (_, i) => cell("a", i, `기존${i}`));
    const plan = planCrossTeamCreate({
      cells: full,
      workDate: D,
      targetColumnIds: ["a"],
      entries: [],
      companions,
    });
    expect(plan.creates.map((c) => c.text.subText)).toEqual(["입회 : 박황열"]);
    expect(plan.skipped).toEqual([{ columnId: "a", reason: "full", mainText: "신호수" }]);
  });
});
