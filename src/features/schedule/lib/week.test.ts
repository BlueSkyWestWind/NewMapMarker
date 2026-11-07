import { describe, expect, it } from "vitest";
import {
  isMarkColor,
  isTextColor,
  markLabel,
  textColorLabel,
} from "@/features/schedule/types";
import {
  addDays,
  addMonths,
  isValidIso,
  isValidMonth,
  monthGridDates,
  monthOf,
  todayIso,
  weekDatesOf,
  weekStartOf,
  weekStartsOf,
  weekdayLabel,
} from "./week";

describe("주 계산", () => {
  it("월요일은 자기 자신이 주의 시작이다", () => {
    expect(weekStartOf("2026-11-09")).toBe("2026-11-09");
  });

  it("일요일은 직전 월요일 주에 속한다", () => {
    expect(weekStartOf("2026-11-15")).toBe("2026-11-09");
  });

  it("연말·연초를 넘는 주를 찾는다", () => {
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
    expect(weekDatesOf("2026-12-28")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
  });

  it("weekStartsOf는 그 날짜가 속한 주부터 n개 주의 월요일을 준다", () => {
    expect(weekStartsOf("2026-11-11", 2)).toEqual(["2026-11-09", "2026-11-16"]);
    expect(weekStartsOf("2026-12-30", 2)).toEqual(["2026-12-28", "2027-01-04"]);
  });
});

describe("날짜 계산", () => {
  it("addDays는 월 경계를 넘는다", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("요일 이름을 준다", () => {
    expect(weekdayLabel("2026-11-09")).toBe("월");
    expect(weekdayLabel("2026-11-15")).toBe("일");
  });

  it("존재하지 않는 날짜와 형식이 틀린 값을 거른다", () => {
    expect(isValidIso("2026-11-09")).toBe(true);
    expect(isValidIso("2026-02-30")).toBe(false);
    expect(isValidIso("2026-11-9")).toBe(false);
  });

  it("todayIso는 로컬 달력 날짜를 쓴다(자정 직전에도 같은 날)", () => {
    expect(todayIso(new Date(2026, 10, 9, 23, 30))).toBe("2026-11-09");
  });
});

describe("월 계산", () => {
  it("monthOf·addMonths", () => {
    expect(monthOf("2026-11-09")).toBe("2026-11");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("isValidMonth는 yyyy-mm 형식과 1~12월만 통과시킨다", () => {
    expect(isValidMonth("2026-11")).toBe(true);
    expect(isValidMonth("2026-1")).toBe(false);
    expect(isValidMonth("2026-13")).toBe(false);
    expect(isValidMonth("2026-00")).toBe(false);
    expect(isValidMonth("20261-11")).toBe(false);
    expect(isValidMonth("")).toBe(false);
  });

  it("monthGridDates는 월요일 시작으로 그 달을 덮는 주를 준다(6주)", () => {
    const dates = monthGridDates("2026-11");
    expect(dates).toHaveLength(42);
    expect(dates[0]).toBe("2026-10-26");
    expect(dates[41]).toBe("2026-12-06");
  });

  it("monthGridDates는 4주짜리 달도 준다", () => {
    const dates = monthGridDates("2027-02");
    expect(dates).toHaveLength(28);
    expect(dates[0]).toBe("2027-02-01");
    expect(dates[27]).toBe("2027-02-28");
  });
});

describe("색 판별과 이름", () => {
  it("isMarkColor는 5색만 통과시킨다", () => {
    expect(isMarkColor("D9F2D0")).toBe(true);
    expect(isMarkColor("d9f2d0")).toBe(false);
    expect(isMarkColor("FFFFFF")).toBe(false);
    expect(isMarkColor(null)).toBe(false);
  });

  it("isTextColor는 파랑·빨강만 통과시킨다", () => {
    expect(isTextColor("0070C0")).toBe(true);
    expect(isTextColor("FF0000")).toBe(true);
    expect(isTextColor("00B0F0")).toBe(false);
    expect(isTextColor(null)).toBe(false);
  });

  it("범례 이름이 있는 색은 이름을, 없는 색은 색 이름을 준다", () => {
    expect(markLabel("D9F2D0")).toBe("중장비");
    expect(markLabel("F2CFEE")).toBe("승주");
    expect(markLabel("4E95D9")).toBe("K대응");
    expect(markLabel("FF5050")).toBe("빨강 칸");
    expect(markLabel("D1D1D1")).toBe("회색 칸");
    expect(textColorLabel("0070C0")).toBe("축전지수거");
    expect(textColorLabel("FF0000")).toBe("빨강 글자");
  });
});
