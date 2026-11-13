import { KMA_WARN_RATIO } from "@/features/worksite-weather/constants/kma-usage";

/**
 * 기상청 호출 집계용 순수 함수. 서버·클라이언트 모두에서 쓰므로 `server-only`를 쓰지 않는다.
 * Workers는 UTC로 동작하므로 KST는 +9h 보정 후 getUTC* 로만 읽는다.
 */

export interface UsageRow {
  /** DB가 준 timestamptz 문자열 */
  hourKst: string;
  provider: string;
  operation: string;
  source: "user" | "prefetch" | "manual";
  calls: number;
  errors: number;
}

export interface HourUsage {
  hour: number;
  user: number;
  prefetch: number;
  /** [현재 데이터로 갱신] 버튼이 받은 호출 */
  manual: number;
  errors: number;
}

export interface DayUsage {
  date: string;
  user: number;
  prefetch: number;
  manual: number;
  total: number;
  errors: number;
}

export interface KmaUsageReport {
  available: true;
  limit: number;
  todayTotal: number;
  ratio: number;
  warn: boolean;
  hours: HourUsage[];
  days: DayUsage[];
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const pad2 = (n: number): string => String(n).padStart(2, "0");

function kstFields(ms: number): { date: string; hour: number } {
  const d = new Date(ms + KST_OFFSET_MS);
  return {
    date: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
    hour: d.getUTCHours(),
  };
}

/** KST 정시로 내린 순간의 ISO. `record_kma_call`의 `p_hour`로 그대로 쓴다. */
export function kstHourStartIso(now: Date): string {
  const floored = Math.floor((now.getTime() + KST_OFFSET_MS) / HOUR_MS) * HOUR_MS;
  const d = new Date(floored);
  const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return `${date}T${pad2(d.getUTCHours())}:00:00+09:00`;
}

/** ISO 시각의 KST 날짜(YYYY-MM-DD) */
export function kstDateKey(iso: string): string {
  return kstFields(new Date(iso).getTime()).date;
}

/** 오늘(KST) 0~23시 24칸. 기록이 없는 시간대도 0으로 채운다. */
export function buildTodayHours(rows: UsageRow[], todayKey: string): HourUsage[] {
  const hours: HourUsage[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    user: 0,
    prefetch: 0,
    manual: 0,
    errors: 0,
  }));

  for (const r of rows) {
    const { date, hour } = kstFields(new Date(r.hourKst).getTime());
    if (date !== todayKey) continue;
    const slot = hours[hour];
    if (r.source === "prefetch") slot.prefetch += r.calls;
    else if (r.source === "manual") slot.manual += r.calls;
    else slot.user += r.calls;
    slot.errors += r.errors;
  }
  return hours;
}

/** 오늘 포함 최근 `days`일, 과거→현재 순. 기록이 없는 날은 0. */
export function buildDailyTotals(rows: UsageRow[], todayKey: string, days: number): DayUsage[] {
  const todayMs = new Date(`${todayKey}T00:00:00+09:00`).getTime();
  const list: DayUsage[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    list.push({
      date: kstFields(todayMs - i * DAY_MS).date,
      user: 0,
      prefetch: 0,
      manual: 0,
      total: 0,
      errors: 0,
    });
  }
  const byDate = new Map(list.map((d) => [d.date, d]));

  for (const r of rows) {
    const day = byDate.get(kstDateKey(r.hourKst));
    if (!day) continue;
    if (r.source === "prefetch") day.prefetch += r.calls;
    else if (r.source === "manual") day.manual += r.calls;
    else day.user += r.calls;
    day.total += r.calls;
    day.errors += r.errors;
  }
  return list;
}

/** 한도 대비 사용률. 한도가 0 이하면 0, 한도를 넘으면 1 초과 값을 그대로 돌려준다. */
export function usageRatio(calls: number, limit: number): number {
  if (limit <= 0) return 0;
  return calls / limit;
}

export function isOverWarn(ratio: number, warn: number = KMA_WARN_RATIO): boolean {
  return ratio >= warn;
}

/** 관리자 API 응답 본문 조립 */
export function buildUsageReport(rows: UsageRow[], now: Date, limit: number): KmaUsageReport {
  const todayKey = kstDateKey(now.toISOString());
  const hours = buildTodayHours(rows, todayKey);
  const days = buildDailyTotals(rows, todayKey, 7);
  const todayTotal = hours.reduce((sum, h) => sum + h.user + h.prefetch + h.manual, 0);
  const ratio = usageRatio(todayTotal, limit);
  return { available: true, limit, todayTotal, ratio, warn: isOverWarn(ratio), hours, days };
}

/**
 * 자동 수집이 돌고 있어야 할 시간(KST 07:30~17:59)인데 오늘 `prefetch` 호출이 0건인가.
 * 수집 설정(vault 토큰·주소, pg_net)이 안 끝난 신호다. 수집 시간대 밖에서는 판단하지 않는다.
 */
export function isPrefetchStalled(todayHours: HourUsage[], now: Date): boolean {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  const inWindow = minutes >= 7 * 60 + 30 && kst.getUTCHours() < 18;
  return inWindow && todayHours.every((h) => h.prefetch === 0);
}
