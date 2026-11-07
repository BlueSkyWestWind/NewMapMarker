import { describe, expect, it } from "vitest";
import { isValidIso, weekdayLabel } from "./week";
import { HOLIDAYS, holidayName } from "./holidays";

describe("holidayName", () => {
  it("공휴일이면 이름을, 아니면 null을 돌려준다", () => {
    expect(holidayName("2026-12-25")).toBe("성탄절");
    expect(holidayName("2026-12-24")).toBeNull();
    expect(holidayName("2026-11-19")).toBeNull();
  });

  it("설날·추석은 당일과 연휴를 구분한다", () => {
    expect(holidayName("2026-02-16")).toBe("설날 연휴");
    expect(holidayName("2026-02-17")).toBe("설날");
    expect(holidayName("2026-09-25")).toBe("추석");
    expect(holidayName("2026-09-24")).toBe("추석 연휴");
  });

  it("대체공휴일은 원래 휴일 이름을 붙인다", () => {
    expect(holidayName("2026-03-02")).toBe("대체공휴일(삼일절)");
    expect(holidayName("2026-10-05")).toBe("대체공휴일(개천절)");
    // 2026 추석은 토요일에 걸쳐도 대체공휴일이 없다(일요일과 겹칠 때만 생긴다).
    expect(holidayName("2026-09-28")).toBeNull();
    expect(holidayName("2027-02-09")).toBe("대체공휴일(설날)");
  });

  it("같은 날 겹친 휴일은 함께 적는다", () => {
    expect(holidayName("2025-05-05")).toBe("어린이날·부처님오신날");
    expect(holidayName("2028-10-03")).toBe("추석·개천절");
  });
});

describe("HOLIDAYS 표", () => {
  it("모든 키가 올바른 날짜이고 이름이 비어 있지 않다", () => {
    for (const [date, name] of Object.entries(HOLIDAYS)) {
      expect(isValidIso(date), date).toBe(true);
      expect(name.trim(), date).not.toBe("");
    }
  });

  it("KASI 월력의 요일과 맞는다(표 입력 실수 점검)", () => {
    const weekdays: Record<string, string> = {
      "2025-03-03": "월",
      "2025-10-08": "수",
      "2026-03-02": "월",
      "2026-06-03": "수",
      "2026-08-17": "월",
      "2026-10-05": "월",
      "2027-02-09": "화",
      "2027-10-11": "월",
      "2027-12-27": "월",
      "2028-04-12": "수",
      "2028-10-05": "목",
    };
    for (const [date, weekday] of Object.entries(weekdays)) {
      expect(HOLIDAYS[date], date).toBeDefined();
      expect(weekdayLabel(date), date).toBe(weekday);
    }
  });

  it("연도별 휴일 수(KASI)", () => {
    const count = (year: string) => Object.keys(HOLIDAYS).filter((d) => d.startsWith(year)).length;
    expect(count("2025")).toBe(19);
    expect(count("2026")).toBe(21);
    expect(count("2027")).toBe(24);
    expect(count("2028")).toBe(18);
  });
});
