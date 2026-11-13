import type { LoginEvent } from "../types";

/** `public.login_history` 한 행(필요한 열만). */
export interface LoginHistoryRow {
  occurred_at: string;
  action: string;
  ip: string | null;
  user_agent: string | null;
}

/** 테이블 행을 이벤트로 바꾼다. login·logout만 남기고 최근 순으로 돌려준다. */
export function toLoginEvents(rows: readonly LoginHistoryRow[]): LoginEvent[] {
  return rows
    .filter((row) => row.action === "login" || row.action === "logout")
    .map((row) => ({
      at: row.occurred_at,
      action: row.action as LoginEvent["action"],
      ip: row.ip ?? null,
      userAgent: row.user_agent ?? null,
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** 접속 기록 요약(순수 함수): 날짜별·시간대별 로그인 횟수와 접속 IP. */

export interface DaySummary {
  /** 로컬 날짜 `yyyy-MM-dd` */
  date: string;
  logins: number;
  logouts: number;
  /** 그날 접속한 IP(중복 없이, 최근 순) */
  ips: string[];
  firstLoginAt: string | null;
  lastLoginAt: string | null;
}

export interface HistorySummary {
  totalLogins: number;
  /** 전체 기간에 접속한 IP(중복 없이, 최근 순) */
  uniqueIps: string[];
  lastLoginAt: string | null;
  /** 최근 날짜가 위 */
  days: DaySummary[];
  /** 0~23시별 로그인 횟수 */
  loginsByHour: number[];
}

const pad = (value: number) => String(value).padStart(2, "0");

export function localDateKey(isoString: string): string | null {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `HH:mm`(로컬). 잘못된 값이면 `-`. */
export function formatClock(isoString: string | null | undefined): string {
  if (!isoString) return "-";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "-";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 로그인·로그아웃 이벤트(순서 무관)를 날짜별·시간대별로 요약한다. */
export function summarizeLoginHistory(events: readonly LoginEvent[]): HistorySummary {
  const sorted = [...events].sort((a, b) => b.at.localeCompare(a.at));
  const loginsByHour = Array.from({ length: 24 }, () => 0);
  const uniqueIps: string[] = [];
  const byDate = new Map<string, DaySummary>();
  let totalLogins = 0;
  let lastLoginAt: string | null = null;

  for (const event of sorted) {
    const key = localDateKey(event.at);
    if (key === null) continue;
    let day = byDate.get(key);
    if (!day) {
      day = { date: key, logins: 0, logouts: 0, ips: [], firstLoginAt: null, lastLoginAt: null };
      byDate.set(key, day);
    }
    if (event.ip && !day.ips.includes(event.ip)) day.ips.push(event.ip);
    if (event.ip && !uniqueIps.includes(event.ip)) uniqueIps.push(event.ip);

    if (event.action === "logout") {
      day.logouts += 1;
      continue;
    }
    totalLogins += 1;
    day.logins += 1;
    loginsByHour[new Date(event.at).getHours()] += 1;
    // 최근 순으로 훑으므로 처음 만난 로그인이 마지막 로그인, 계속 덮어쓴 값이 첫 로그인이다.
    day.lastLoginAt ??= event.at;
    day.firstLoginAt = event.at;
    lastLoginAt ??= event.at;
  }

  return {
    totalLogins,
    uniqueIps,
    lastLoginAt,
    days: [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)),
    loginsByHour,
  };
}
