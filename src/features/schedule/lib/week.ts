/**
 * ISO 날짜 문자열(`yyyy-mm-dd`) 기반 주·월 계산. 모두 UTC 기준이라 시간대와 무관하다.
 * 주는 월요일에 시작한다.
 */

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toIso(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function parseIso(iso: string): Date | null {
  const match = ISO_PATTERN.exec(iso);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  // 2026-02-30 같은 값은 다음 달로 넘어가므로 왕복 비교로 거른다.
  return toIso(date) === iso ? date : null;
}

function mustParse(iso: string): Date {
  const date = parseIso(iso);
  if (!date) throw new Error(`잘못된 날짜: ${iso}`);
  return date;
}

export function isValidIso(iso: string): boolean {
  return parseIso(iso) !== null;
}

/** "yyyy-mm" 형식의 1~12월인가. 잘못된 값이 계산 함수에 들어가 예외를 던지지 않게 입력 쪽에서 쓴다. */
export function isValidMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

export function addDays(iso: string, days: number): string {
  return toIso(new Date(mustParse(iso).getTime() + days * DAY_MS));
}

/** 그 날짜가 속한 주의 월요일. */
export function weekStartOf(iso: string): string {
  const day = mustParse(iso).getUTCDay(); // 0 = 일요일
  const sinceMonday = (day + 6) % 7;
  return addDays(iso, -sinceMonday);
}

export function weekDatesOf(startIso: string): string[] {
  return Array.from({ length: 7 }, (_, offset) => addDays(startIso, offset));
}

/** "월"~"일". */
export function weekdayLabel(iso: string): string {
  return WEEKDAY_LABELS[mustParse(iso).getUTCDay()];
}

/** 로컬 달력 기준 오늘. 자정 직전에도 같은 날짜가 나와야 해서 UTC가 아니라 로컬 값을 쓴다. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 그 날짜가 속한 주부터 `weeks`개 주의 월요일. */
export function weekStartsOf(fromIso: string, weeks: number): string[] {
  const first = weekStartOf(fromIso);
  return Array.from({ length: weeks }, (_, index) => addDays(first, index * 7));
}

/** "2026-11-09" → "2026-11" */
export function monthOf(iso: string): string {
  mustParse(iso);
  return iso.slice(0, 7);
}

/** "2026-12" + 1 → "2027-01" */
export function addMonths(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const index = year * 12 + (mon - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

/** 월요일 시작으로 그 달을 덮는 주들의 날짜(28~42개, 7의 배수). */
export function monthGridDates(month: string): string[] {
  const first = `${month}-01`;
  const next = `${addMonths(month, 1)}-01`;
  const lastDay = addDays(next, -1);
  const start = weekStartOf(first);
  const end = addDays(weekStartOf(lastDay), 6);
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}
