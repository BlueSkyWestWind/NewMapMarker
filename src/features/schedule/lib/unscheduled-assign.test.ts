import { describe, expect, it } from "vitest";
import { MAX_ROWS } from "@/features/schedule/lib/cell-grid";
import {
  formatAssignPreview,
  parsePerDay,
  planUnscheduledAssign,
  type AssignStation,
} from "@/features/schedule/lib/unscheduled-assign";

function stations(count: number): AssignStation[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `st-${i + 1}`,
    label: `국소${i + 1}`,
  }));
}

describe("planUnscheduledAssign", () => {
  it("① perDay가 null이고 빈 행이 충분하면 startDate 하루에 순서대로 배정한다", () => {
    const plan = planUnscheduledAssign({
      stations: stations(3),
      startDate: "2026-11-09",
      perDay: null,
      includeOffDays: false,
      memo: "모국A",
      usedRowsByDate: { "2026-11-09": [0, 2] },
      maxRows: MAX_ROWS,
      maxDays: 31,
    });

    expect(plan).toEqual({
      days: [
        {
          date: "2026-11-09",
          creates: [
            { rowNo: 3, mainText: "국소1", subText: "모국A" },
            { rowNo: 4, mainText: "국소2", subText: "모국A" },
            { rowNo: 5, mainText: "국소3", subText: "모국A" },
          ],
        },
      ],
      skipped: [],
    });
  });

  it("② perDay가 null이고 행이 3개만 비어 있으면 3건만 넣고 2건은 skipped(full)이다", () => {
    const used = Array.from({ length: 27 }, (_, i) => i); // 0..26 사용 중 -> 27, 28, 29(3개) 비어 있음
    const plan = planUnscheduledAssign({
      stations: stations(5),
      startDate: "2026-11-09",
      perDay: null,
      includeOffDays: false,
      memo: "",
      usedRowsByDate: { "2026-11-09": used },
      maxRows: MAX_ROWS,
      maxDays: 31,
    });

    expect(plan.days).toEqual([
      {
        date: "2026-11-09",
        creates: [
          { rowNo: 27, mainText: "국소1", subText: "" },
          { rowNo: 28, mainText: "국소2", subText: "" },
          { rowNo: 29, mainText: "국소3", subText: "" },
        ],
      },
    ]);
    expect(plan.skipped).toEqual([
      { label: "국소4", reason: "full" },
      { label: "국소5", reason: "full" },
    ]);
  });

  it("③ perDay=2, 5건, 월요일(2026-11-09) 시작이면 월·화·수 3일에 2, 2, 1건씩 배정한다", () => {
    const plan = planUnscheduledAssign({
      stations: stations(5),
      startDate: "2026-11-09",
      perDay: 2,
      includeOffDays: false,
      memo: "",
      usedRowsByDate: {},
      maxRows: MAX_ROWS,
      maxDays: 31,
    });

    expect(plan.days.map((d) => [d.date, d.creates.map((c) => c.mainText)])).toEqual([
      ["2026-11-09", ["국소1", "국소2"]],
      ["2026-11-10", ["국소3", "국소4"]],
      ["2026-11-11", ["국소5"]],
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("④ 금요일(2026-11-13) 시작, perDay=2이면 토·일을 건너뛰고 금·월·화로 배정한다", () => {
    const plan = planUnscheduledAssign({
      stations: stations(5),
      startDate: "2026-11-13",
      perDay: 2,
      includeOffDays: false,
      memo: "",
      usedRowsByDate: {},
      maxRows: MAX_ROWS,
      maxDays: 31,
    });

    expect(plan.days.map((d) => [d.date, d.creates.length])).toEqual([
      ["2026-11-13", 2],
      ["2026-11-16", 2],
      ["2026-11-17", 1],
    ]);
  });

  it("⑤ 월요일이 공휴일(2026-03-02 대체공휴일)이면 건너뛰고 화요일(2026-03-03)부터 배정한다", () => {
    const plan = planUnscheduledAssign({
      stations: stations(3),
      startDate: "2026-03-02",
      perDay: 2,
      includeOffDays: false,
      memo: "",
      usedRowsByDate: {},
      maxRows: MAX_ROWS,
      maxDays: 31,
    });

    expect(plan.days.map((d) => [d.date, d.creates.length])).toEqual([
      ["2026-03-03", 2],
      ["2026-03-04", 1],
    ]);
  });

  it("⑥ includeOffDays=true이면 주말(2026-11-14 토·2026-11-15 일)도 포함한다", () => {
    const plan = planUnscheduledAssign({
      stations: stations(5),
      startDate: "2026-11-13",
      perDay: 2,
      includeOffDays: true,
      memo: "",
      usedRowsByDate: {},
      maxRows: MAX_ROWS,
      maxDays: 31,
    });

    expect(plan.days.map((d) => [d.date, d.creates.length])).toEqual([
      ["2026-11-13", 2],
      ["2026-11-14", 2],
      ["2026-11-15", 1],
    ]);
  });

  it("⑦ 어떤 날짜의 빈 행이 0이면 그 날짜는 건너뛰고 다음 날에 이어 넣는다", () => {
    const fullDay = Array.from({ length: MAX_ROWS }, (_, i) => i);
    const plan = planUnscheduledAssign({
      stations: stations(4),
      startDate: "2026-11-09",
      perDay: 2,
      includeOffDays: false,
      memo: "",
      usedRowsByDate: { "2026-11-10": fullDay },
      maxRows: MAX_ROWS,
      maxDays: 31,
    });

    expect(plan.days.map((d) => [d.date, d.creates.length])).toEqual([
      ["2026-11-09", 2],
      ["2026-11-11", 2],
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("⑧ maxDays=2이고 5건 perDay=2이면 4건만 넣고 1건은 skipped(range)다", () => {
    const plan = planUnscheduledAssign({
      stations: stations(5),
      startDate: "2026-11-09",
      perDay: 2,
      includeOffDays: false,
      memo: "",
      usedRowsByDate: {},
      maxRows: MAX_ROWS,
      maxDays: 2,
    });

    expect(plan.days.map((d) => [d.date, d.creates.length])).toEqual([
      ["2026-11-09", 2],
      ["2026-11-10", 2],
    ]);
    expect(plan.skipped).toEqual([{ label: "국소5", reason: "range" }]);
  });

  it("⑨ 메모의 앞뒤 공백과 연속 공백·줄바꿈을 한 칸 공백으로 정리한다", () => {
    const plan = planUnscheduledAssign({
      stations: stations(1),
      startDate: "2026-11-09",
      perDay: null,
      includeOffDays: false,
      memo: "  모국1  \n  스카이   장비  ",
      usedRowsByDate: {},
      maxRows: MAX_ROWS,
      maxDays: 31,
    });

    expect(plan.days[0].creates[0].subText).toBe("모국1 스카이 장비");
  });

  it("⑩ stations가 비어 있으면 빈 계획을 돌려준다", () => {
    const plan = planUnscheduledAssign({
      stations: [],
      startDate: "2026-11-09",
      perDay: 3,
      includeOffDays: false,
      memo: "메모",
      usedRowsByDate: {},
      maxRows: MAX_ROWS,
      maxDays: 31,
    });

    expect(plan).toEqual({ days: [], skipped: [] });
  });
});

describe("parsePerDay & formatAssignPreview", () => {
  it("parsePerDay는 1~30 정수만 인정하고 그 외는 null이다", () => {
    expect(parsePerDay("")).toBeNull();
    expect(parsePerDay("  ")).toBeNull();
    expect(parsePerDay("0")).toBeNull();
    expect(parsePerDay("31")).toBeNull();
    expect(parsePerDay("2.5")).toBeNull();
    expect(parsePerDay("-1")).toBeNull();
    expect(parsePerDay("1")).toBe(1);
    expect(parsePerDay(" 15 ")).toBe(15);
    expect(parsePerDay("30")).toBe(30);
  });

  it("formatAssignPreview는 M/D N건 요약과 넣지 못함 건수를 한 줄로 만든다", () => {
    expect(
      formatAssignPreview({
        days: [
          { date: "2026-07-21", creates: Array(5).fill({ rowNo: 0, mainText: "a", subText: "" }) },
          { date: "2026-07-22", creates: Array(2).fill({ rowNo: 0, mainText: "b", subText: "" }) },
        ],
        skipped: [{ label: "x", reason: "full" }],
      }),
    ).toBe("7/21 5건 · 7/22 2건 (넣지 못함 1건)");

    expect(formatAssignPreview({ days: [], skipped: [] })).toBe("");
  });
});
