import { WORK_HOURS } from "@/features/worksite-weather/constants/thresholds";
import { apparentTemp, round1 } from "@/features/worksite-weather/lib/apparent-temp";
import {
  isSnowLike,
  parseAmount,
  ptyText,
  skyText,
  toNumberOrNull,
} from "@/features/worksite-weather/lib/parse-amount";
import { evaluateSlot } from "@/features/worksite-weather/lib/verdict";
import { windDirection, windLabel } from "@/features/worksite-weather/lib/wind";
import type {
  SlotSource,
  WeatherSlot,
  WorkType,
} from "@/features/worksite-weather/types/weather";

/** 기상청 응답 item 공통 형태. 소스별로 채워지는 필드가 다르다. */
export interface KmaItem {
  category?: string;
  fcstDate?: string;
  fcstTime?: string;
  fcstValue?: string;
  obsrValue?: string;
}

/** category → 값 */
export type CategoryMap = Record<string, string>;
/** "0700" → category 맵 */
export type SlotMap = Record<string, CategoryMap>;

/** 07~17시 슬롯에 필요한 카테고리만. 나머지는 조기 skip해 순회 비용을 줄인다. */
const NEEDED_CATEGORIES = new Set([
  "TMP", "T1H", "REH", "WSD", "VEC", "POP", "PTY", "PCP", "RN1", "SNO", "SKY",
]);

const WORK_HOUR_SET = new Set<string>(WORK_HOURS);

/**
 * 예보 응답(단기·초단기) → 07~17시 슬롯 맵.
 * 배열을 단 한 번만 순회한다. (Workers CPU 예산 보호)
 */
export function collectForecastSlots(
  items: KmaItem[] | null | undefined,
  targetDate: string,
): SlotMap {
  const slots: SlotMap = {};
  if (!items) return slots;

  for (const item of items) {
    if (item.fcstDate !== targetDate) continue;
    const time = item.fcstTime ?? "";
    if (!WORK_HOUR_SET.has(time)) continue;
    const category = item.category ?? "";
    if (!NEEDED_CATEGORIES.has(category)) continue;

    (slots[time] ??= {})[category] = item.fcstValue ?? "";
  }
  return slots;
}

/** 초단기실황 → category 맵 (시간 축이 없는 단일 관측) */
export function collectObservation(items: KmaItem[] | null | undefined): CategoryMap {
  const map: CategoryMap = {};
  if (!items) return map;

  for (const item of items) {
    const category = item.category ?? "";
    if (!NEEDED_CATEGORIES.has(category)) continue;
    map[category] = item.obsrValue ?? item.fcstValue ?? "";
  }
  return map;
}

/** 소스별 카테고리 차이를 흡수한 중간 표현 */
interface NormalizedSlot {
  temp: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windDeg: number | null;
  pop: number | null;
  ptyCode: string;
  pcpRaw: string;
  snoRaw: string;
  skyCode: string;
}

function emptyNormalized(): NormalizedSlot {
  return {
    temp: null,
    humidity: null,
    windSpeed: null,
    windDeg: null,
    pop: null,
    ptyCode: "",
    pcpRaw: "",
    snoRaw: "",
    skyCode: "",
  };
}

/**
 * 단기예보 슬롯을 정규화한다. 기온 코드가 소스마다 다르므로(TMP vs T1H) 여기서 흡수한다.
 * 값이 없으면 null을 유지한다 — 결측을 0으로 채우면 판정이 조용히 틀어진다.
 */
function normalizeVilage(map: CategoryMap | undefined): NormalizedSlot {
  const slot = emptyNormalized();
  if (!map) return slot;

  slot.temp = toNumberOrNull(map.TMP);
  slot.humidity = toNumberOrNull(map.REH);
  slot.windSpeed = toNumberOrNull(map.WSD);
  slot.windDeg = toNumberOrNull(map.VEC);
  slot.pop = toNumberOrNull(map.POP);
  slot.ptyCode = map.PTY ?? "";
  slot.pcpRaw = map.PCP ?? "";
  slot.snoRaw = map.SNO ?? "";
  slot.skyCode = map.SKY ?? "";
  return slot;
}

/**
 * 초단기(실황·예보) 값을 단기예보 위에 덮는다.
 * 초단기에는 POP·SNO가 없으므로 **덮어쓰지 않고 남긴다.** 전체 교체가 아니라 항목별 오버레이다.
 */
function overlayUltra(base: NormalizedSlot, map: CategoryMap | undefined): NormalizedSlot {
  if (!map) return base;
  const next = { ...base };

  const temp = toNumberOrNull(map.T1H);
  if (temp !== null) next.temp = temp;

  const humidity = toNumberOrNull(map.REH);
  if (humidity !== null) next.humidity = humidity;

  const windSpeed = toNumberOrNull(map.WSD);
  if (windSpeed !== null) next.windSpeed = windSpeed;

  const windDeg = toNumberOrNull(map.VEC);
  if (windDeg !== null) next.windDeg = windDeg;

  if (map.PTY) next.ptyCode = map.PTY;
  if (map.SKY) next.skyCode = map.SKY;
  // RN1은 수치(mm)로 오므로 문자열 PCP보다 정확하다
  if (map.RN1 !== undefined && map.RN1 !== "") next.pcpRaw = map.RN1;

  return next;
}

export interface BuildTimelineInput {
  targetDate: string;
  vilage: SlotMap;
  ultra: SlotMap;
  observation: CategoryMap;
  /** 초단기실황의 관측 시각 "HH00". 이 슬롯에만 실황을 덮는다. */
  observationTime: string;
  /** 현재 시각 "HHmm" (KST) */
  nowHhmm: string;
  workType: WorkType;
}

/** 07~17시 11슬롯을 소스 우선순위대로 병합하고 판정까지 붙인다. */
export function buildTimeline(input: BuildTimelineInput): WeatherSlot[] {
  const currentHour = `${input.nowHhmm.slice(0, 2)}00`;

  return WORK_HOURS.map((time) => {
    const vilageMap = input.vilage[time];
    const ultraMap = input.ultra[time];
    const hasObservation =
      time === input.observationTime && Object.keys(input.observation).length > 0;

    let normalized = normalizeVilage(vilageMap);
    if (ultraMap) normalized = overlayUltra(normalized, ultraMap);
    if (hasObservation) normalized = overlayUltra(normalized, input.observation);

    const source = resolveSource({
      hasObservation,
      hasUltra: Boolean(ultraMap),
      hasVilage: Boolean(vilageMap),
      isPast: time < currentHour,
    });

    return buildSlot(time, source, normalized, input.workType);
  });
}

function resolveSource(flags: {
  hasObservation: boolean;
  hasUltra: boolean;
  hasVilage: boolean;
  isPast: boolean;
}): SlotSource {
  if (flags.hasObservation) return "ncst";
  if (!flags.hasVilage && !flags.hasUltra) return "missing";
  if (flags.isPast) return "past";
  if (flags.hasUltra) return "ultra";
  return "vilage";
}

function buildSlot(
  time: string,
  source: SlotSource,
  normalized: NormalizedSlot,
  workType: WorkType,
): WeatherSlot {
  const pcp = parseAmount(normalized.pcpRaw);
  const sno = parseAmount(normalized.snoRaw);

  // 체감온도는 기온·습도·풍속이 모두 있어야 계산된다. 하나라도 없으면 null로 둔다.
  const canComputeApparent =
    normalized.temp !== null && normalized.humidity !== null && normalized.windSpeed !== null;
  const apparent = canComputeApparent
    ? round1(apparentTemp(normalized.temp, normalized.humidity, normalized.windSpeed).value)
    : null;

  const { verdict, reasons } = evaluateSlot({
    time,
    apparent,
    temp: normalized.temp,
    windSpeed: normalized.windSpeed,
    pop: normalized.pop,
    pcp: pcp.max,
    pcpLabel: pcp.label,
    sno: sno.max,
    snoLabel: sno.label,
    isSnow: isSnowLike(normalized.ptyCode),
    workType,
  });

  return {
    time,
    source,
    temp: normalized.temp === null ? null : round1(normalized.temp),
    apparent,
    humidity: normalized.humidity,
    windSpeed: normalized.windSpeed === null ? null : round1(normalized.windSpeed),
    windDeg: normalized.windDeg,
    windDir: windDirection(normalized.windDeg),
    windLabel: windLabel(normalized.windSpeed),
    pop: normalized.pop,
    pty: ptyText(normalized.ptyCode),
    pcp: pcp.max,
    pcpLabel: pcp.label,
    sno: sno.max,
    snoLabel: sno.label,
    sky: skyText(normalized.skyCode),
    verdict,
    reasons,
  };
}

/** 11슬롯 중 실제로 값이 채워진 개수. 결측 경고 문구 생성에 쓴다. */
export function countMissingSlots(slots: WeatherSlot[]): number {
  return slots.filter((slot) => slot.source === "missing" || slot.verdict === "unknown").length;
}
