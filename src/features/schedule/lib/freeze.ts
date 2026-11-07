import { addDays, isValidIso } from "@/features/schedule/lib/week";

/**
 * 작업금지(프리징) 기간. 수능처럼 작업을 못 하는 날을 날짜·시각으로 정해 일정표에 표시한다.
 * 시각은 모두 한국 시각이고 `yyyy-mm-ddTHH:mm` 문자열로 다룬다(브라우저 시간대에 흔들리지 않게 한다).
 * DB에는 `+09:00`을 붙여 timestamptz로 넣는다.
 */

/** 사유 길이 제한. DB의 `reason` CHECK와 같다. */
export const FREEZE_REASON_MAX_LENGTH = 100;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const LOCAL_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

export interface Freeze {
  id: string;
  /** 한국 시각 `yyyy-mm-ddTHH:mm` */
  start: string;
  /** 한국 시각 `yyyy-mm-ddTHH:mm`. 이 시각까지 금지다 */
  end: string;
  reason: string;
}

export interface FreezeInput {
  start: string;
  end: string;
  reason: string;
}

export type FreezeCheck =
  | { ok: true; value: FreezeInput }
  | { ok: false; error: "date" | "order" | "reason" };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `yyyy-mm-ddTHH:mm`이 실제 날짜·시각이면 날짜와 `HH:mm`을 나눠 준다. */
function splitLocal(local: string): { date: string; time: string } | null {
  const match = LOCAL_PATTERN.exec(local);
  if (!match) return null;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (!isValidIso(match[1]) || hour > 23 || minute > 59) return null;
  return { date: match[1], time: `${match[2]}:${match[3]}` };
}

/** 입력(한국 시각)을 DB에 넣을 timestamptz 문자열로. */
export function toDbTimestamp(local: string): string {
  return `${local}:00+09:00`;
}

/** DB가 돌려준 시각(UTC나 오프셋 포함)을 한국 시각 `yyyy-mm-ddTHH:mm`으로. */
export function toKstLocal(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** 입력 검사. 시작·종료가 올바른 시각이어야 하고, 종료가 시작보다 늦어야 하며, 사유가 있어야 한다. */
export function validateFreeze(input: FreezeInput): FreezeCheck {
  if (!splitLocal(input.start) || !splitLocal(input.end)) return { ok: false, error: "date" };
  // 같은 형식의 문자열이라 사전순이 곧 시간순이다.
  if (input.end <= input.start) return { ok: false, error: "order" };
  const reason = input.reason.trim();
  if (reason === "" || reason.length > FREEZE_REASON_MAX_LENGTH) return { ok: false, error: "reason" };
  return { ok: true, value: { start: input.start, end: input.end, reason } };
}

/**
 * 그 날짜 안에서 금지인 시간대. 하루 전체면 종일.
 * `continued`(전날부터 이어지는 날)는 시작이 이 날짜가 아니라 `~ 07:00`처럼 끝 시각만 보인다.
 */
export function freezeTimeLabel(from: string, to: string, continued = false): string {
  if (from === "00:00" && to === "24:00") return "종일";
  if (to === "24:00") return `${from}~`;
  return continued ? `~ ${to}` : `${from}~${to}`;
}

export interface FreezeBadge {
  id: string;
  reason: string;
  /** 그 날짜의 금지 시간대. 예: `08:10~18:00`, `종일` */
  time: string;
  /** 마우스를 올리면 보이는 전체 기간 */
  title: string;
}

/**
 * 날짜별로 걸치는 작업금지 배지. 여러 날에 걸치면 첫날은 시작 시각부터, 마지막 날은 끝 시각까지,
 * 중간 날짜는 종일이다. 끝이 0시 정각이면 그 날짜는 금지에 들지 않는다. 같은 날은 시작 시각 순이다.
 */
export function freezeBadgesByDate(freezes: Freeze[], dates: string[]): Map<string, FreezeBadge[]> {
  const result = new Map<string, FreezeBadge[]>();
  const sorted = [...freezes].sort((a, b) => a.start.localeCompare(b.start));
  for (const freeze of sorted) {
    const start = splitLocal(freeze.start);
    const end = splitLocal(freeze.end);
    if (!start || !end) continue;
    const endsAtMidnight = end.time === "00:00";
    const lastDate = endsAtMidnight ? addDays(end.date, -1) : end.date;
    const title = `${freeze.reason} · ${start.date} ${start.time} ~ ${end.date} ${end.time}`;
    for (const date of dates) {
      if (date < start.date || date > lastDate) continue;
      const from = date === start.date ? start.time : "00:00";
      const to = date === lastDate ? (endsAtMidnight ? "24:00" : end.time) : "24:00";
      const badges = result.get(date) ?? [];
      badges.push({
        id: freeze.id,
        reason: freeze.reason,
        time: freezeTimeLabel(from, to, date !== start.date),
        title,
      });
      result.set(date, badges);
    }
  }
  return result;
}
