/**
 * 기상청 API 기준시각 계산.
 *
 * Cloudflare Workers는 UTC로 동작한다. `getHours()` 등 로컬시간 API를 쓰면
 * 로컬에서는 통과하고 배포 후에만 NO_DATA가 나므로, KST(UTC+9) 필드를 직접 만든다.
 */

export interface KmaBase {
  /** YYYYMMDD */
  baseDate: string;
  /** HHmm */
  baseTime: string;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad2 = (n: number): string => String(n).padStart(2, "0");

interface KstParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** UTC Date → KST 달력 필드. getUTC* 로만 읽어 실행 환경 타임존에 의존하지 않는다. */
export function toKstParts(now: Date, dayOffset = 0): KstParts {
  const kst = new Date(now.getTime() + KST_OFFSET_MS + dayOffset * DAY_MS);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
  };
}

export function ymdKst(now: Date, dayOffset = 0): string {
  const { year, month, day } = toKstParts(now, dayOffset);
  return `${year}${pad2(month)}${pad2(day)}`;
}

/** "YYYY-MM-DD" (KST) */
export function isoDateKst(now: Date, dayOffset = 0): string {
  const { year, month, day } = toKstParts(now, dayOffset);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** 발표 +10분 후 제공. 네트워크·반영 지연을 감안해 5분 여유를 더 둔다. */
const PUBLISH_DELAY_MIN = 15;

/**
 * 07~17시 골격용 단기예보 기준시각.
 *
 * 최신 발표분(예: 14시)을 쓰면 그 이전 시간대 예보가 응답에 없어 오전 슬롯이 통째로 빈다.
 * 07시 이전 발표(05 → 02 → 전일 23) 중 이미 제공 중인 것을 고른다. (CR-004 §4.4)
 */
export function getVilageBaseForToday(now: Date = new Date()): KmaBase {
  const { hour, minute } = toKstParts(now);
  const isPublished = (baseHour: number): boolean =>
    hour > baseHour || (hour === baseHour && minute >= PUBLISH_DELAY_MIN);

  if (isPublished(5)) return { baseDate: ymdKst(now), baseTime: "0500" };
  if (isPublished(2)) return { baseDate: ymdKst(now), baseTime: "0200" };
  // 02시 발표 전(00:00~02:14 KST) → 전일 23시 발표분이 당일 07~17시를 덮는다
  return { baseDate: ymdKst(now, -1), baseTime: "2300" };
}

/** 초단기실황: 매시 정시 관측 → 약 40분 후 제공 */
const NCST_DELAY_MIN = 40;

export function getUltraNcstBase(now: Date = new Date()): KmaBase {
  const { hour, minute } = toKstParts(now);
  if (minute >= NCST_DELAY_MIN) {
    return { baseDate: ymdKst(now), baseTime: `${pad2(hour)}00` };
  }
  if (hour === 0) return { baseDate: ymdKst(now, -1), baseTime: "2300" };
  return { baseDate: ymdKst(now), baseTime: `${pad2(hour - 1)}00` };
}

/** 초단기예보: 매시 30분 발표 → 약 15분 후 제공 */
const ULTRA_FCST_PUBLISH_MIN = 30;
const ULTRA_FCST_DELAY_MIN = 45;

export function getUltraFcstBase(now: Date = new Date()): KmaBase {
  const { hour, minute } = toKstParts(now);
  if (minute >= ULTRA_FCST_DELAY_MIN) {
    return { baseDate: ymdKst(now), baseTime: `${pad2(hour)}${ULTRA_FCST_PUBLISH_MIN}` };
  }
  if (hour === 0) return { baseDate: ymdKst(now, -1), baseTime: "2330" };
  return { baseDate: ymdKst(now), baseTime: `${pad2(hour - 1)}${ULTRA_FCST_PUBLISH_MIN}` };
}

/** 현재 시각을 "HHmm"(KST)로. 슬롯 경과 여부 판정에 쓴다. */
export function currentKstHhmm(now: Date = new Date()): string {
  const { hour, minute } = toKstParts(now);
  return `${pad2(hour)}${pad2(minute)}`;
}

/** 단기예보 발표시각 → 표시용 ISO 문자열(KST offset 명시) */
export function baseToIsoKst(base: KmaBase): string {
  const d = base.baseDate;
  const t = base.baseTime;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:00+09:00`;
}
