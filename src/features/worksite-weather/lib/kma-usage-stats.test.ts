import { describe, expect, it } from "vitest";
import {
  buildDailyTotals,
  buildTodayHours,
  buildUsageReport,
  isOverWarn,
  kstDateKey,
  kstHourStartIso,
  usageRatio,
  type UsageRow,
} from "./kma-usage-stats";

const row = (partial: Partial<UsageRow>): UsageRow => ({
  hourKst: "2026-11-09T14:00:00+09:00",
  provider: "apihub",
  operation: "getVilageFcst",
  source: "user",
  calls: 1,
  errors: 0,
  ...partial,
});

describe("kstHourStartIso", () => {
  it("KST 정시로 내린다", () => {
    expect(kstHourStartIso(new Date("2026-11-09T05:37:12Z"))).toBe("2026-11-09T14:00:00+09:00");
  });

  it("KST 자정은 UTC 날짜가 달라도 다음 날 0시다", () => {
    expect(kstHourStartIso(new Date("2026-11-09T15:00:00Z"))).toBe("2026-11-10T00:00:00+09:00");
  });

  it("자정 직전은 같은 날 23시다", () => {
    expect(kstHourStartIso(new Date("2026-11-09T14:59:59Z"))).toBe("2026-11-09T23:00:00+09:00");
  });
});

describe("kstDateKey", () => {
  it("UTC로는 전날이어도 KST 날짜를 돌려준다", () => {
    expect(kstDateKey("2026-11-09T15:30:00Z")).toBe("2026-11-10");
  });
});

describe("buildTodayHours", () => {
  it("행이 없어도 0~23시 24칸이 모두 나온다", () => {
    const hours = buildTodayHours([], "2026-11-09");
    expect(hours).toHaveLength(24);
    expect(hours.every((h) => h.user === 0 && h.prefetch === 0 && h.errors === 0)).toBe(true);
    expect(hours[0].hour).toBe(0);
    expect(hours[23].hour).toBe(23);
  });

  it("해당 시간대에만 합산하고 출처를 나눈다", () => {
    const hours = buildTodayHours(
      [
        row({ calls: 3, errors: 1 }),
        row({ source: "prefetch", calls: 2, operation: "getUltraSrtFcst" }),
      ],
      "2026-11-09",
    );
    expect(hours[14]).toEqual({ hour: 14, user: 3, prefetch: 2, errors: 1 });
    expect(hours[13].user).toBe(0);
  });

  it("어제 행은 무시한다", () => {
    const hours = buildTodayHours([row({ hourKst: "2026-11-08T14:00:00+09:00", calls: 9 })], "2026-11-09");
    expect(hours[14].user).toBe(0);
  });
});

describe("buildDailyTotals", () => {
  it("오늘 포함 최근 N일을 과거→현재 순으로 돌려준다", () => {
    const days = buildDailyTotals([], "2026-11-09", 7);
    expect(days).toHaveLength(7);
    expect(days[0].date).toBe("2026-11-03");
    expect(days[6].date).toBe("2026-11-09");
    expect(days.every((d) => d.total === 0)).toBe(true);
  });

  it("같은 날 여러 행을 합산한다", () => {
    const days = buildDailyTotals(
      [
        row({ hourKst: "2026-11-09T09:00:00+09:00", calls: 4 }),
        row({ hourKst: "2026-11-09T10:00:00+09:00", source: "prefetch", calls: 6, errors: 2 }),
        row({ hourKst: "2026-11-07T23:00:00+09:00", calls: 5 }),
      ],
      "2026-11-09",
      7,
    );
    expect(days[6]).toEqual({ date: "2026-11-09", user: 4, prefetch: 6, total: 10, errors: 2 });
    expect(days[4].total).toBe(5);
  });
});

describe("usageRatio / isOverWarn", () => {
  it("비율을 계산한다", () => {
    expect(usageRatio(5000, 10000)).toBe(0.5);
  });

  it("한도를 넘어도 1 초과 값을 그대로 둔다", () => {
    expect(usageRatio(12000, 10000)).toBe(1.2);
  });

  it("한도가 0 이하면 0", () => {
    expect(usageRatio(10, 0)).toBe(0);
  });

  it("80% 이상부터 경고", () => {
    expect(isOverWarn(0.79)).toBe(false);
    expect(isOverWarn(0.8)).toBe(true);
  });
});

describe("buildUsageReport", () => {
  it("오늘 합계·사용률·경고를 만든다", () => {
    const report = buildUsageReport(
      [
        row({ calls: 6000 }),
        row({ source: "prefetch", calls: 2500, operation: "getUltraSrtNcst" }),
      ],
      new Date("2026-11-09T05:37:12Z"),
      10000,
    );
    expect(report.todayTotal).toBe(8500);
    expect(report.ratio).toBe(0.85);
    expect(report.warn).toBe(true);
    expect(report.hours).toHaveLength(24);
    expect(report.days).toHaveLength(7);
  });

  it("행이 없으면 0이고 경고가 없다", () => {
    const report = buildUsageReport([], new Date("2026-11-09T05:37:12Z"), 10000);
    expect(report.todayTotal).toBe(0);
    expect(report.warn).toBe(false);
    expect(report.available).toBe(true);
  });
});
