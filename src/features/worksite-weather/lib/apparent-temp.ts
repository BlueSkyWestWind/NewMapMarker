import { APPARENT_TEMP_BOUNDS } from "@/features/worksite-weather/constants/thresholds";

/**
 * 여름철 체감온도(기온 ≥ 25℃) — 기상청 2020 개정 공식.
 * Tw는 Stull 습구온도이며 atan은 라디안 기준이다.
 */
export function heatIndexSummer(ta: number, rh: number): number {
  const tw =
    ta * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(ta + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035;

  return (
    -0.2442 +
    0.55399 * tw +
    0.45535 * ta -
    0.0022 * tw * tw +
    0.00278 * tw * ta +
    3.0
  );
}

/** 겨울철 체감온도(기온 ≤ 10℃, 풍속 ≥ 1.3m/s) — 기상청 공식 */
export function windChillWinter(ta: number, windMs: number): number {
  const kmh = windMs * 3.6;
  // 공식 적용 범위를 벗어나면 외삽하지 않고 기온을 그대로 쓴다
  if (ta > APPARENT_TEMP_BOUNDS.winterMaxTemp) return ta;
  if (kmh < APPARENT_TEMP_BOUNDS.winterMinWindMs * 3.6) return ta;

  const p = Math.pow(kmh, 0.16);
  return 13.12 + 0.6215 * ta - 11.37 * p + 0.3965 * p * ta;
}

export type ApparentTempType = "heat" | "cold" | "normal";

export interface ApparentTemp {
  value: number;
  type: ApparentTempType;
}

/**
 * 기온·습도·풍속 → 체감온도.
 * 25℃ 이상은 열지수, 10℃ 이하는 풍냉지수, 그 사이는 기온을 그대로 쓴다.
 */
export function apparentTemp(ta: number, rh: number, windMs: number): ApparentTemp {
  if (ta >= APPARENT_TEMP_BOUNDS.summerMinTemp) {
    return { value: heatIndexSummer(ta, rh), type: "heat" };
  }
  if (ta <= APPARENT_TEMP_BOUNDS.winterMaxTemp) {
    return { value: windChillWinter(ta, windMs), type: "cold" };
  }
  return { value: ta, type: "normal" };
}

/** 표시용 소수 1자리 반올림. 판정에는 원값을 쓴다. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
