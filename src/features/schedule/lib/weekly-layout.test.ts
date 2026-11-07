import { describe, expect, it } from "vitest";
import type { ScheduleCell } from "@/features/schedule/types";
import { buildWeeklyWeeks, computeWeeklyScale, weeklyDayRowCount } from "./weekly-layout";

function cell(workDate: string, rowNo: number): ScheduleCell {
  return {
    id: `${workDate}-${rowNo}`,
    workDate,
    columnId: "a",
    rowNo,
    mainText: "국소",
    subText: "",
    textColor: null,
  };
}

describe("weeklyDayRowCount", () => {
  const D = "2026-11-09";

  it("칸이 없거나 적으면 최소 10행이다", () => {
    expect(weeklyDayRowCount([], D)).toBe(10);
    expect(weeklyDayRowCount([cell(D, 3)], D)).toBe(10);
  });

  it("행 번호가 크면 그 아래까지 늘린다", () => {
    expect(weeklyDayRowCount([cell(D, 11)], D)).toBe(12);
  });

  it("다른 날짜의 칸은 무시한다", () => {
    expect(weeklyDayRowCount([cell("2026-11-10", 20)], D)).toBe(10);
  });
});

describe("buildWeeklyWeeks", () => {
  it("월~일 7일 블록과 날짜 메모를 만든다", () => {
    const weeks = buildWeeklyWeeks({
      weekStarts: ["2026-11-09"],
      cells: [],
      dayNotes: [{ workDate: "2026-11-10", note: "메모A" }],
    });
    expect(weeks).toHaveLength(1);
    expect(weeks[0].start).toBe("2026-11-09");
    expect(weeks[0].days.map((day) => day.workDate)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
    expect(weeks[0].days[0].weekday).toBe("월요일");
    expect(weeks[0].days[6].weekday).toBe("일요일");
    expect(weeks[0].days[1].note).toBe("메모A");
    expect(weeks[0].days[0].note).toBe("");
    expect(weeks[0].days.every((day) => day.rowCount === 10)).toBe(true);
  });

  it("행이 많은 날은 블록이 늘어난다", () => {
    const weeks = buildWeeklyWeeks({
      weekStarts: ["2026-11-09"],
      cells: [cell("2026-11-11", 11)],
      dayNotes: [],
    });
    expect(weeks[0].days[2].rowCount).toBe(12);
  });

  it("주가 여럿이면 순서를 지킨다", () => {
    const weeks = buildWeeklyWeeks({
      weekStarts: ["2026-11-09", "2026-11-16"],
      cells: [],
      dayNotes: [],
    });
    expect(weeks.map((week) => week.start)).toEqual(["2026-11-09", "2026-11-16"]);
  });
});

describe("computeWeeklyScale", () => {
  it("A3 가로는 폭이 확대율을 정한다", () => {
    expect(computeWeeklyScale({ paper: "A3", columnCount: 10, weekRowCounts: [70] })).toBe(42);
  });

  it("A4 가로는 더 작아진다", () => {
    expect(computeWeeklyScale({ paper: "A4", columnCount: 10, weekRowCounts: [70] })).toBe(29);
  });

  it("행이 아주 많으면 높이가 확대율을 정한다", () => {
    expect(computeWeeklyScale({ paper: "A3", columnCount: 10, weekRowCounts: [120] })).toBe(29);
    expect(computeWeeklyScale({ paper: "A4", columnCount: 10, weekRowCounts: [160] })).toBe(15);
  });

  it("가장 큰 주를 기준으로 한다", () => {
    expect(computeWeeklyScale({ paper: "A3", columnCount: 10, weekRowCounts: [70, 140] })).toBe(
      computeWeeklyScale({ paper: "A3", columnCount: 10, weekRowCounts: [140] }),
    );
  });

  it("아무리 커도 10% 밑으로 내려가지 않는다", () => {
    expect(computeWeeklyScale({ paper: "A3", columnCount: 10, weekRowCounts: [5000] })).toBe(10);
  });
});
