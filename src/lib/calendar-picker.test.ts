import { describe, expect, it } from "vitest";
import {
  buildDayGrid,
  buildDecadeGrid,
  buildYearGrid,
  clampIsoToYearMonth,
  normalizeToIsoDate,
  stepYearMonth,
} from "./calendar-picker";

describe("calendar-picker", () => {
  it("2026년 11월(1일이 일요일)은 10월 25~31일 7칸 + 11월 1~30일 + 12월 1~5일로 42칸을 만든다", () => {
    const cells = buildDayGrid(2026, 11);
    expect(cells).toHaveLength(42);
    expect(cells[0]).toEqual({ iso: "2026-10-25", day: 25, inMonth: false });
    expect(cells[6]).toEqual({ iso: "2026-10-31", day: 31, inMonth: false });
    expect(cells[7]).toEqual({ iso: "2026-11-01", day: 1, inMonth: true });
    expect(cells[13]).toEqual({ iso: "2026-11-07", day: 7, inMonth: true });
    expect(cells[36]).toEqual({ iso: "2026-11-30", day: 30, inMonth: true });
    expect(cells[37]).toEqual({ iso: "2026-12-01", day: 1, inMonth: false });
    expect(cells[41]).toEqual({ iso: "2026-12-05", day: 5, inMonth: false });
  });

  it("10년 단위 연도 격자는 2019(비활성)~2030(비활성) 12칸을 반환한다", () => {
    const { decadeStart, decadeEnd, cells } = buildYearGrid(2026);
    expect(decadeStart).toBe(2020);
    expect(decadeEnd).toBe(2029);
    expect(cells).toHaveLength(12);
    expect(cells[0]).toEqual({ year: 2019, inDecade: false });
    expect(cells[1]).toEqual({ year: 2020, inDecade: true });
    expect(cells[10]).toEqual({ year: 2029, inDecade: true });
    expect(cells[11]).toEqual({ year: 2030, inDecade: false });
  });

  it("100년 단위 연대 격자는 1990-1999~2100-2109 12칸을 반환한다", () => {
    const { centuryStart, centuryEnd, cells } = buildDecadeGrid(2026);
    expect(centuryStart).toBe(2000);
    expect(centuryEnd).toBe(2099);
    expect(cells).toHaveLength(12);
    expect(cells[0]).toEqual({ startYear: 1990, endYear: 1999, inCentury: false });
    expect(cells[3]).toEqual({ startYear: 2020, endYear: 2029, inCentury: true });
    expect(cells[11]).toEqual({ startYear: 2100, endYear: 2109, inCentury: false });
  });

  it("월 변경 시 말일을 넘기면 해당 월의 마지막 날짜로 보정한다", () => {
    expect(clampIsoToYearMonth("2026-01-31", 2026, 2)).toBe("2026-02-28");
    expect(clampIsoToYearMonth("2024-01-31", 2024, 2)).toBe("2024-02-29");
  });

  it("점(.)이나 슬래시(/) 구분 날짜도 ISO 형식으로 정규화한다", () => {
    expect(normalizeToIsoDate("2024.5.1")).toBe("2024-05-01");
    expect(normalizeToIsoDate("2026-11", "month")).toBe("2026-11-01");
  });

  it("월 증감 시 연도 경계를 정확히 넘긴다", () => {
    expect(stepYearMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(stepYearMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });
});
