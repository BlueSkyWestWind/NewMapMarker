import { describe, expect, it } from "vitest";
import { MAX_ROWS } from "./cell-grid";
import { expandPeriodDates, MAX_PERIOD_DAYS, planPeriodCreate, type PeriodEntry } from "./period";
import type { ScheduleCell } from "@/features/schedule/types";

describe("expandPeriodDates", () => {
  it("평일만 있는 기간은 시작일 다음 날부터 종료일까지 모두 만든다", () => {
    // 2026-11-09 월 ~ 11-12 목
    expect(
      expandPeriodDates({ startIso: "2026-11-09", endIso: "2026-11-12", includeOffDays: false }),
    ).toEqual({ dates: ["2026-11-10", "2026-11-11", "2026-11-12"], skipped: [] });
  });

  it("기본은 토·일을 제외하고 이유를 알려 준다", () => {
    // 11-12 목 ~ 11-17 화: 11-14 토, 11-15 일
    expect(
      expandPeriodDates({ startIso: "2026-11-12", endIso: "2026-11-17", includeOffDays: false }),
    ).toEqual({
      dates: ["2026-11-13", "2026-11-16", "2026-11-17"],
      skipped: [
        { date: "2026-11-14", reason: "weekend" },
        { date: "2026-11-15", reason: "weekend" },
      ],
    });
  });

  it("includeOffDays면 토·일도 만든다", () => {
    expect(
      expandPeriodDates({ startIso: "2026-11-12", endIso: "2026-11-17", includeOffDays: true }),
    ).toEqual({
      dates: ["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"],
      skipped: [],
    });
  });

  it("공휴일은 평일이어도 기본 제외하고 holiday로 알린다", () => {
    // 2026-12-25 금(성탄절), 12-26 토, 12-27 일
    expect(
      expandPeriodDates({ startIso: "2026-12-23", endIso: "2026-12-28", includeOffDays: false }),
    ).toEqual({
      dates: ["2026-12-24", "2026-12-28"],
      skipped: [
        { date: "2026-12-25", reason: "holiday" },
        { date: "2026-12-26", reason: "weekend" },
        { date: "2026-12-27", reason: "weekend" },
      ],
    });
  });

  it("includeOffDays면 공휴일도 만든다", () => {
    const result = expandPeriodDates({
      startIso: "2026-12-24",
      endIso: "2026-12-25",
      includeOffDays: true,
    });
    expect(result).toEqual({ dates: ["2026-12-25"], skipped: [] });
  });

  it("시작일과 종료일이 같으면 추가 날짜가 없다", () => {
    expect(
      expandPeriodDates({ startIso: "2026-11-09", endIso: "2026-11-09", includeOffDays: false }),
    ).toEqual({ dates: [], skipped: [] });
  });

  it("종료일이 시작일보다 이르면 reversed다", () => {
    expect(
      expandPeriodDates({ startIso: "2026-11-09", endIso: "2026-11-08", includeOffDays: false }),
    ).toEqual({ error: "reversed" });
  });

  it("날짜 형식이 틀리면 invalid다", () => {
    expect(
      expandPeriodDates({ startIso: "2026-11-09", endIso: "내일", includeOffDays: false }),
    ).toEqual({ error: "invalid" });
    expect(
      expandPeriodDates({ startIso: "2026-13-40", endIso: "2026-11-09", includeOffDays: false }),
    ).toEqual({ error: "invalid" });
  });

  it("시작일로부터 31일까지는 허용하고 32일부터는 too-long이다", () => {
    expect(MAX_PERIOD_DAYS).toBe(31);
    // 11-09 + 31일 = 12-10
    const ok = expandPeriodDates({ startIso: "2026-11-09", endIso: "2026-12-10", includeOffDays: true });
    expect("dates" in ok && ok.dates).toHaveLength(31);
    expect(
      expandPeriodDates({ startIso: "2026-11-09", endIso: "2026-12-11", includeOffDays: true }),
    ).toEqual({ error: "too-long" });
  });
});

function cell(workDate: string, columnId: string, rowNo: number, mainText: string, subText = ""): ScheduleCell {
  return { id: `${workDate}-${columnId}-${rowNo}`, workDate, columnId, rowNo, mainText, subText, textColor: null };
}

const entry = (mainText: string, endIso: string | null, noCompanion = false): PeriodEntry => ({
  mainText,
  subText: "",
  textColor: null,
  companionTarget: noCompanion,
  endIso,
});

describe("planPeriodCreate", () => {
  const base = { startIso: "2026-11-09", includeOffDays: false, companions: [] };

  it("날짜마다 같은 팀의 첫 빈 행에 만든다", () => {
    const plan = planPeriodCreate({
      ...base,
      cells: [],
      targetColumnIds: ["a"],
      entries: [entry("가", "2026-11-11")],
    });
    expect("error" in plan).toBe(false);
    if ("error" in plan) return;
    expect(plan.dates).toEqual(["2026-11-10", "2026-11-11"]);
    expect(plan.creates.map((c) => [c.position.workDate, c.columnId, c.position.rowNo, c.text.mainText])).toEqual([
      ["2026-11-10", "a", 0, "가"],
      ["2026-11-11", "a", 0, "가"],
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("이미 있는 날은 duplicate로 건너뛰고 다른 날은 만든다(다시 저장해도 중복이 없다)", () => {
    const plan = planPeriodCreate({
      ...base,
      cells: [cell("2026-11-10", "a", 0, "가")],
      targetColumnIds: ["a"],
      entries: [entry("가", "2026-11-11")],
    });
    if ("error" in plan) throw new Error("unexpected error");
    expect(plan.skipped).toEqual([
      { date: "2026-11-10", columnId: "a", reason: "duplicate", mainText: "가" },
    ]);
    expect(plan.creates.map((c) => c.position.workDate)).toEqual(["2026-11-11"]);
  });

  it("항목마다 종료일이 달라 일부 날짜에만 들어간다", () => {
    const plan = planPeriodCreate({
      ...base,
      cells: [],
      targetColumnIds: ["a"],
      entries: [entry("A", "2026-11-12"), entry("B", "2026-11-10")],
    });
    if ("error" in plan) throw new Error("unexpected error");
    const byDate = (date: string) =>
      plan.creates.filter((c) => c.position.workDate === date).map((c) => c.text.mainText);
    expect(byDate("2026-11-10")).toEqual(["A", "B"]);
    expect(byDate("2026-11-11")).toEqual(["A"]);
    expect(byDate("2026-11-12")).toEqual(["A"]);
  });

  it("종료일이 없는 항목은 제외한다", () => {
    const plan = planPeriodCreate({
      ...base,
      cells: [],
      targetColumnIds: ["a"],
      entries: [entry("가", null)],
    });
    expect(plan).toMatchObject({ creates: [], dates: [], skipped: [], skippedDates: [] });
  });

  it("팀이 여러 개면 날짜마다 팀별로 만든다", () => {
    const plan = planPeriodCreate({
      ...base,
      cells: [],
      targetColumnIds: ["a", "b"],
      entries: [entry("가", "2026-11-11")],
    });
    if ("error" in plan) throw new Error("unexpected error");
    expect(plan.creates).toHaveLength(4);
    expect(plan.creates.filter((c) => c.columnId === "b")).toHaveLength(2);
  });

  it("입회·신호수와 대상 표시는 날짜마다 복사한다", () => {
    const plan = planPeriodCreate({
      ...base,
      cells: [],
      targetColumnIds: ["a"],
      entries: [entry("가", "2026-11-10", true)],
      companions: [{ kind: "입회", names: "홍" }],
    });
    if ("error" in plan) throw new Error("unexpected error");
    expect(plan.creates.map((c) => [c.position.rowNo, c.text.mainText, c.text.subText])).toEqual([
      [0, "가", ""],
      [1, "", "입회 : 홍"],
    ]);
    expect(plan.creates[0].text.companionTarget).toBe(true);
  });

  it("주말은 기본 제외하고 skippedDates로 알리며, includeOffDays면 만든다", () => {
    // 11-12 목 ~ 11-16 월
    const input = {
      cells: [],
      targetColumnIds: ["a"],
      entries: [entry("가", "2026-11-16")],
      companions: [],
      startIso: "2026-11-12",
    };
    const excluded = planPeriodCreate({ ...input, includeOffDays: false });
    if ("error" in excluded) throw new Error("unexpected error");
    expect(excluded.dates).toEqual(["2026-11-13", "2026-11-16"]);
    expect(excluded.skippedDates).toEqual([
      { date: "2026-11-14", reason: "weekend" },
      { date: "2026-11-15", reason: "weekend" },
    ]);
    const included = planPeriodCreate({ ...input, includeOffDays: true });
    if ("error" in included) throw new Error("unexpected error");
    expect(included.dates).toHaveLength(4);
  });

  it("종료일이 시작일보다 이르면 reversed, 형식이 틀리면 invalid, 너무 길면 too-long이다", () => {
    const run = (endIso: string) =>
      planPeriodCreate({
        ...base,
        cells: [],
        targetColumnIds: ["a"],
        entries: [entry("가", endIso)],
      });
    expect(run("2026-11-08")).toEqual({ error: "reversed" });
    expect(run("내일")).toEqual({ error: "invalid" });
    expect(run("2027-03-01")).toEqual({ error: "too-long" });
  });

  it("어떤 날짜의 팀 행이 가득 차면 그 날짜·팀만 full로 건너뛴다", () => {
    const full = Array.from({ length: MAX_ROWS }, (_, i) => cell("2026-11-10", "a", i, `기존${i}`));
    const plan = planPeriodCreate({
      ...base,
      cells: full,
      targetColumnIds: ["a"],
      entries: [entry("가", "2026-11-11")],
    });
    if ("error" in plan) throw new Error("unexpected error");
    expect(plan.skipped).toEqual([
      { date: "2026-11-10", columnId: "a", reason: "full", mainText: "가" },
    ]);
    expect(plan.creates.map((c) => c.position.workDate)).toEqual(["2026-11-11"]);
  });
});

