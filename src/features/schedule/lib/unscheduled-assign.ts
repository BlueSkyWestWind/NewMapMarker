import { holidayName } from "@/features/schedule/lib/holidays";
import { nextFreeRows } from "@/features/schedule/lib/unscheduled-stations";
import { addDays } from "@/features/schedule/lib/week";

export interface AssignStation {
  id: string;
  label: string;
}

export interface AssignInput {
  /** 사용자가 고른 국소(화면 이름 순서 그대로) */
  stations: AssignStation[];
  /** yyyy-mm-dd */
  startDate: string;
  /** null이면 startDate 하루에 전부 배정 */
  perDay: number | null;
  /** true이면 주말·공휴일도 포함 */
  includeOffDays: boolean;
  /** 모든 줄의 subText (공백 정리 후 저장) */
  memo: string;
  /** 그 팀의 날짜별 사용 중인 행 번호 */
  usedRowsByDate: Record<string, number[]>;
  maxRows: number;
  maxDays: number;
}

export interface AssignDay {
  date: string;
  creates: { rowNo: number; mainText: string; subText: string }[];
}

export interface AssignPlan {
  days: AssignDay[];
  skipped: { label: string; reason: "full" | "range" }[];
}

function isOffDay(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6 || holidayName(date) !== null;
}

function normalizeMemo(memo: string): string {
  return memo.replace(/\s+/g, " ").trim();
}

/**
 * 선택한 미배정 국소를 시작일부터 날짜별 빈 행에 배정하는 계획을 세운다(순수 함수).
 */
export function planUnscheduledAssign(input: AssignInput): AssignPlan {
  if (input.stations.length === 0) {
    return { days: [], skipped: [] };
  }

  const subText = normalizeMemo(input.memo);

  if (input.perDay === null) {
    const used = input.usedRowsByDate[input.startDate] ?? [];
    const rows = nextFreeRows(used, input.stations.length, input.maxRows);
    const creates = rows.map((rowNo, index) => ({
      rowNo,
      mainText: input.stations[index].label,
      subText,
    }));
    const skipped = input.stations.slice(rows.length).map((station) => ({
      label: station.label,
      reason: "full" as const,
    }));
    return {
      days: creates.length > 0 ? [{ date: input.startDate, creates }] : [],
      skipped,
    };
  }

  const perDay = Math.max(1, Math.floor(input.perDay));
  const days: AssignDay[] = [];
  const skipped: AssignPlan["skipped"] = [];

  let cursor = 0;
  let workedDays = 0;
  let date = input.startDate;

  while (cursor < input.stations.length) {
    if (!input.includeOffDays && isOffDay(date)) {
      date = addDays(date, 1);
      continue;
    }

    workedDays += 1;
    if (workedDays > input.maxDays) {
      for (let i = cursor; i < input.stations.length; i += 1) {
        skipped.push({ label: input.stations[i].label, reason: "range" });
      }
      break;
    }

    const used = input.usedRowsByDate[date] ?? [];
    const want = Math.min(perDay, input.stations.length - cursor);
    const rows = nextFreeRows(used, want, input.maxRows);

    if (rows.length > 0) {
      const creates = rows.map((rowNo, index) => ({
        rowNo,
        mainText: input.stations[cursor + index].label,
        subText,
      }));
      days.push({ date, creates });
      cursor += rows.length;
    }

    date = addDays(date, 1);
  }

  return { days, skipped };
}

/** 하루 최대 N건 입력을 파싱한다. 1~30 정수만 인정하고 비우거나 잘못되면 null. */
export function parsePerDay(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (parsed < 1 || parsed > 30) return null;
  return parsed;
}

function formatShortDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

/** 배정 계획을 `7/21 5건 · 7/22 2건 (넣지 못함 1건)` 형태의 한 줄 요약으로 만든다. */
export function formatAssignPreview(plan: AssignPlan): string {
  const dayText = plan.days
    .map((day) => `${formatShortDate(day.date)} ${day.creates.length}건`)
    .join(" · ");

  if (plan.skipped.length === 0) return dayText;
  if (dayText === "") return `넣지 못함 ${plan.skipped.length}건`;
  return `${dayText} (넣지 못함 ${plan.skipped.length}건)`;
}
