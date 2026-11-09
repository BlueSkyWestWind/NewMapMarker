import { describe, expect, it } from "vitest";
import { summarizeLoginHistory } from "./login-history";
import type { LoginEvent } from "../types";

const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();
const event = (when: string, action: LoginEvent["action"], ip: string | null): LoginEvent => ({ at: when, action, ip });

describe("summarizeLoginHistory", () => {
  const events: LoginEvent[] = [
    event(at(9, 8, 43), "login", "1.1.1.1"),
    event(at(9, 12, 0), "logout", "1.1.1.1"),
    event(at(9, 13, 50), "login", "2.2.2.2"),
    event(at(8, 9, 5), "login", "1.1.1.1"),
    event(at(8, 9, 40), "login", null),
  ];

  it("날짜별로 묶고 최근 날짜가 위에 온다", () => {
    const summary = summarizeLoginHistory(events);
    expect(summary.days.map((day) => day.date)).toEqual(["2026-11-09", "2026-11-08"]);
    const nine = summary.days[0];
    expect(nine.logins).toBe(2);
    expect(nine.logouts).toBe(1);
    expect(nine.ips).toEqual(["2.2.2.2", "1.1.1.1"]);
    expect(nine.firstLoginAt).toBe(at(9, 8, 43));
    expect(nine.lastLoginAt).toBe(at(9, 13, 50));
  });

  it("로그인 합계·고유 IP·마지막 로그인·시간대별 횟수를 센다(로그아웃은 제외)", () => {
    const summary = summarizeLoginHistory(events);
    expect(summary.totalLogins).toBe(4);
    expect(summary.uniqueIps).toEqual(["2.2.2.2", "1.1.1.1"]);
    expect(summary.lastLoginAt).toBe(at(9, 13, 50));
    expect(summary.loginsByHour[8]).toBe(1);
    expect(summary.loginsByHour[9]).toBe(2);
    expect(summary.loginsByHour[13]).toBe(1);
    expect(summary.loginsByHour[12]).toBe(0);
    expect(summary.loginsByHour).toHaveLength(24);
  });

  it("기록이 없으면 빈 요약", () => {
    const summary = summarizeLoginHistory([]);
    expect(summary.totalLogins).toBe(0);
    expect(summary.days).toEqual([]);
    expect(summary.lastLoginAt).toBeNull();
  });
});
