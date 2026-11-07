export interface CalendarDayCell {
  iso: string;
  day: number;
  inMonth: boolean;
}

export interface YearCell {
  year: number;
  inDecade: boolean;
}

export interface DecadeCell {
  startYear: number;
  endYear: number;
  inCentury: boolean;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const FLEX_DATE_RE = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function pad4(value: number): string {
  return String(value).padStart(4, "0");
}

function toUtcIso(date: Date): string {
  return `${pad4(date.getUTCFullYear())}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function todayLocalIso(now: Date = new Date()): string {
  return `${pad4(now.getFullYear())}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function isValidIsoDate(iso: string): boolean {
  const match = ISO_DATE_RE.exec(iso);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return toUtcIso(date) === iso;
}

export function isValidIsoMonth(month: string): boolean {
  return ISO_MONTH_RE.test(month);
}

/**
 * 입력 문자열("yyyy-mm-dd", "yyyy.mm.dd", "yyyy-mm" 등)을 유효한 "yyyy-mm-dd"로 정규화한다.
 * 비어 있거나 해석할 수 없으면 오늘 날짜를 반환한다.
 */
export function normalizeToIsoDate(value: string, mode: "date" | "month" = "date"): string {
  const trimmed = value.trim();
  if (mode === "month") {
    if (isValidIsoMonth(trimmed)) return `${trimmed}-01`;
    if (isValidIsoDate(trimmed)) return `${trimmed.slice(0, 7)}-01`;
    return `${todayLocalIso().slice(0, 7)}-01`;
  }
  if (isValidIsoDate(trimmed)) return trimmed;
  const flex = FLEX_DATE_RE.exec(trimmed);
  if (flex) {
    const candidate = `${pad4(Number(flex[1]))}-${pad2(Number(flex[2]))}-${pad2(Number(flex[3]))}`;
    if (isValidIsoDate(candidate)) return candidate;
  }
  return todayLocalIso();
}

export function addUtcDays(iso: string, days: number): string {
  const { year, month, day } = parseIsoParts(iso);
  const utc = Date.UTC(year, month - 1, day) + days * DAY_MS;
  return toUtcIso(new Date(utc));
}

export function stepYearMonth(
  year: number,
  month: number,
  deltaMonths: number,
): { year: number; month: number } {
  const total = year * 12 + (month - 1) + deltaMonths;
  return {
    year: Math.floor(total / 12),
    month: (((total % 12) + 12) % 12) + 1,
  };
}

export function daysInYearMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseIsoParts(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month: m, day: d };
}

export function clampIsoToYearMonth(iso: string, year: number, month: number): string {
  const { day } = parseIsoParts(iso);
  const maxDay = daysInYearMonth(year, month);
  const clampedDay = Math.min(Math.max(1, day), maxDay);
  return `${pad4(year)}-${pad2(month)}-${pad2(clampedDay)}`;
}

/**
 * 일요일 시작 6주(42칸) 달력 격자를 만든다.
 * 1일이 일요일이면 앞 줄 한 주(7칸)를 이전 달로 채워 항상 이전·다음 달 날짜가 함께 보인다.
 */
export function buildDayGrid(year: number, month: number): CalendarDayCell[] {
  const prefix = `${pad4(year)}-${pad2(month)}`;
  const firstIso = `${prefix}-01`;
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0(일) ~ 6(토)
  const leadingDays = firstDow === 0 ? 7 : firstDow;
  const startIso = addUtcDays(firstIso, -leadingDays);

  return Array.from({ length: 42 }, (_, index) => {
    const iso = addUtcDays(startIso, index);
    const day = Number(iso.slice(8, 10));
    return {
      iso,
      day,
      inMonth: iso.startsWith(prefix),
    };
  });
}

/**
 * 10년 단위 연도 선택 격자(12칸: 이전 연도 1칸 + 해당 10년 10칸 + 다음 연도 1칸).
 */
export function buildYearGrid(viewYear: number): {
  decadeStart: number;
  decadeEnd: number;
  cells: YearCell[];
} {
  const decadeStart = Math.floor(viewYear / 10) * 10;
  const decadeEnd = decadeStart + 9;
  const cells = Array.from({ length: 12 }, (_, index) => {
    const year = decadeStart - 1 + index;
    return {
      year,
      inDecade: year >= decadeStart && year <= decadeEnd,
    };
  });
  return { decadeStart, decadeEnd, cells };
}

/**
 * 100년 단위 10년 구간 선택 격자(12칸: 이전 10년 1칸 + 해당 세기 10칸 + 다음 10년 1칸).
 */
export function buildDecadeGrid(viewYear: number): {
  centuryStart: number;
  centuryEnd: number;
  cells: DecadeCell[];
} {
  const centuryStart = Math.floor(viewYear / 100) * 100;
  const centuryEnd = centuryStart + 99;
  const cells = Array.from({ length: 12 }, (_, index) => {
    const startYear = centuryStart - 10 + index * 10;
    const endYear = startYear + 9;
    return {
      startYear,
      endYear,
      inCentury: startYear >= centuryStart && endYear <= centuryEnd,
    };
  });
  return { centuryStart, centuryEnd, cells };
}
