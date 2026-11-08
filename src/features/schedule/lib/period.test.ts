import { describe, expect, it } from "vitest";
import { MAX_ROWS } from "./cell-grid";
import { MAX_WORK_DATES, planWorkDatesCreate, type WorkDatesEntry } from "./period";
import type { ScheduleCell } from "@/features/schedule/types";

function cell(workDate: string, columnId: string, rowNo: number, mainText: string, subText = ""): ScheduleCell {
  return { id: `${workDate}-${columnId}-${rowNo}`, workDate, columnId, rowNo, mainText, subText, textColor: null };
}

const entry = (mainText: string, dates: string[], companionTarget = false): WorkDatesEntry => ({
  mainText,
  subText: "",
  textColor: null,
  companionTarget,
  dates,
});

describe("planWorkDatesCreate", () => {
  // 2026-11-09 월요일에 연 창에서 다른 날짜를 고른 경우
  const base = { startIso: "2026-11-09", companions: [] };

  it("고른 날짜에만 같은 팀의 첫 빈 행에 만든다(고르지 않은 날은 만들지 않는다)", () => {
    const plan = planWorkDatesCreate({
      ...base,
      cells: [],
      targetColumnIds: ["a"],
      entries: [entry("가", ["2026-11-10", "2026-11-12"])],
    });
    if ("error" in plan) throw new Error("unexpected error");
    expect(plan.dates).toEqual(["2026-11-10", "2026-11-12"]);
    expect(
      plan.creates.map((c) => [c.position.workDate, c.columnId, c.position.rowNo, c.text.mainText]),
    ).toEqual([
      ["2026-11-10", "a", 0, "가"],
      ["2026-11-12", "a", 0, "가"],
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("시작일과 같은 날짜·중복해서 고른 날짜는 무시하고 날짜 순서로 처리한다", () => {
    const plan = planWorkDatesCreate({
      ...base,
      cells: [],
      targetColumnIds: ["a"],
      entries: [entry("가", ["2026-11-12", "2026-11-09", "2026-11-10", "2026-11-12"])],
    });
    if ("error" in plan) throw new Error("unexpected error");
    expect(plan.dates).toEqual(["2026-11-10", "2026-11-12"]);
    expect(plan.creates).toHaveLength(2);
  });

  it("시작일보다 이른 날짜도 고르면 만든다", () => {
    const plan = planWorkDatesCreate({
      ...base,
      cells: [],
      targetColumnIds: ["a"],
      entries: [entry("가", ["2026-11-05"])],
    });
    if ("error" in plan) throw new Error("unexpected error");
    expect(plan.creates.map((c) => c.position.workDate)).toEqual(["2026-11-05"]);
  });

  it("토·일·공휴일도 직접 고르면 그대로 만든다", () => {
    // 11-14 토, 11-15 일, 2026-12-25 금(성탄절)
    const plan = planWorkDatesCreate({
      ...base,
      cells: [],
      targetColumnIds: ["a"],
      entries: [entry("가", ["2026-11-14", "2026-11-15", "2026-12-25"])],
    });
    if ("error" in plan) throw new Error("unexpected error");
    expect(plan.creates.map((c) => c.position.workDate)).toEqual([
      "2026-11-14",
      "2026-11-15",
      "2026-12-25",
    ]);
  });

  it("이미 있는 날은 duplicate로 건너뛰고 다른 날은 만든다(다시 저장해도 중복이 없다)", () => {
    const plan = planWorkDatesCreate({
      ...base,
      cells: [cell("2026-11-10", "a", 0, "가")],
      targetColumnIds: ["a"],
      entries: [entry("가", ["2026-11-10", "2026-11-11"])],
    });
    if ("error" in plan) throw new Error("unexpected error");
    expect(plan.skipped).toEqual([
      { date: "2026-11-10", columnId: "a", reason: "duplicate", mainText: "가" },
    ]);
    expect(plan.creates.map((c) => c.position.workDate)).toEqual(["2026-11-11"]);
  });

  it("항목마다 고른 날짜가 달라 그 날짜에만 들어간다", () => {
    const plan = planWorkDatesCreate({
      ...base,
      cells: [],
      targetColumnIds: ["a"],
      entries: [entry("A", ["2026-11-10", "2026-11-12"]), entry("B", ["2026-11-10"])],
    });
    if ("error" in plan) throw new Error("unexpected error");
    const byDate = (date: string) =>
      plan.creates.filter((c) => c.position.workDate === date).map((c) => c.text.mainText);
    expect(byDate("2026-11-10")).toEqual(["A", "B"]);
    expect(byDate("2026-11-12")).toEqual(["A"]);
    expect(byDate("2026-11-11")).toEqual([]);
  });

  it("날짜를 고르지 않은 항목은 제외한다", () => {
    const plan = planWorkDatesCreate({
      ...base,
      cells: [],
      targetColumnIds: ["a"],
      entries: [entry("가", [])],
    });
    expect(plan).toEqual({ creates: [], skipped: [], dates: [] });
  });

  it("팀이 여러 개면 날짜마다 팀별로 만든다", () => {
    const plan = planWorkDatesCreate({
      ...base,
      cells: [],
      targetColumnIds: ["a", "b"],
      entries: [entry("가", ["2026-11-10", "2026-11-11"])],
    });
    if ("error" in plan) throw new Error("unexpected error");
    expect(plan.creates).toHaveLength(4);
    expect(plan.creates.filter((c) => c.columnId === "b")).toHaveLength(2);
  });

  it("입회·신호수와 대상 표시는 고른 날짜마다 복사한다", () => {
    const plan = planWorkDatesCreate({
      ...base,
      cells: [],
      targetColumnIds: ["a"],
      entries: [entry("가", ["2026-11-10"], true)],
      companions: [{ kind: "입회", names: "홍" }],
    });
    if ("error" in plan) throw new Error("unexpected error");
    expect(plan.creates.map((c) => [c.position.rowNo, c.text.mainText, c.text.subText])).toEqual([
      [0, "가", ""],
      [1, "", "입회 : 홍"],
    ]);
    expect(plan.creates[0].text.companionTarget).toBe(true);
  });

  it("날짜 형식이 틀리면 invalid, 한 항목에 31개를 넘게 고르면 too-many다", () => {
    const run = (dates: string[]) =>
      planWorkDatesCreate({ ...base, cells: [], targetColumnIds: ["a"], entries: [entry("가", dates)] });
    expect(run(["내일"])).toEqual({ error: "invalid" });
    expect(run(["2026-13-40"])).toEqual({ error: "invalid" });

    expect(MAX_WORK_DATES).toBe(31);
    const many = Array.from({ length: 32 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`.replace("2026-12-32", "2027-01-01"));
    expect(run(many)).toEqual({ error: "too-many" });
    expect("error" in run(many.slice(0, 31))).toBe(false);
  });

  it("어떤 날짜의 팀 행이 가득 차면 그 날짜·팀만 full로 건너뛴다", () => {
    const full = Array.from({ length: MAX_ROWS }, (_, i) => cell("2026-11-10", "a", i, `기존${i}`));
    const plan = planWorkDatesCreate({
      ...base,
      cells: full,
      targetColumnIds: ["a"],
      entries: [entry("가", ["2026-11-10", "2026-11-11"])],
    });
    if ("error" in plan) throw new Error("unexpected error");
    expect(plan.skipped).toEqual([
      { date: "2026-11-10", columnId: "a", reason: "full", mainText: "가" },
    ]);
    expect(plan.creates.map((c) => c.position.workDate)).toEqual(["2026-11-11"]);
  });
});
