/**
 * 작업 안전 판정 임계값.
 *
 * 한파 하위기준은 정비 진행 중이라 향후 바뀐다. 판정 함수에 숫자를 직접 쓰지 말고
 * 반드시 이 파일을 참조해 값 변경이 한 곳에서 끝나게 한다. (CR-004 §2)
 */

/** 조회 대상 시간대 — 07시부터 17시까지 1시간 간격 11슬롯 */
export const WORK_HOURS = [
  "0700", "0800", "0900", "1000", "1100", "1200",
  "1300", "1400", "1500", "1600", "1700",
] as const;

export const WORK_HOUR_START = WORK_HOURS[0];
export const WORK_HOUR_END = WORK_HOURS[WORK_HOURS.length - 1];

/** 무더위 시간대 — 이 구간의 옥외작업 중지 권고 문구 분기에 사용 */
export const PEAK_HEAT_HOURS = ["1400", "1500", "1600", "1700"] as const;

/** 폭염 — 산업안전보건법상 체감온도(℃). 법정 기준이므로 임의 변경 금지 */
export const HEAT_THRESHOLDS = {
  caution: 31,
  warning: 33,
  danger: 35,
  stop: 38,
} as const;

/** 한파 — 기상청 겨울철 체감온도 준용(℃). 하위기준 확정 시 교체 대상 */
export const COLD_THRESHOLDS = {
  caution: 0,
  warning: -5,
  stop: -10,
} as const;

/** 강풍 — 안전보건규칙 제383조 준용(m/s). 예보 풍속은 순간풍속이 아니므로 경고를 상향 적용 */
export const WIND_THRESHOLDS = {
  caution: 4,
  warning: 7,
  stop: 10,
} as const;

/** 강수 — 강수확률(%) 및 1시간 강수량(mm) / 신적설(cm) */
export const RAIN_THRESHOLDS = {
  /** 강수확률 주의 하한 */
  popCaution: 30,
  /** 강수확률 경고 하한 */
  popWarning: 60,
  /** 제383조: 시간당 1mm 이상 고소작업 중지 */
  pcpStop: 1,
  /** 제383조: 시간당 1cm 이상 작업 중지 */
  snoStop: 1,
} as const;

/** 체감온도 공식 적용 경계 — 기상청 공식의 유효 범위 */
export const APPARENT_TEMP_BOUNDS = {
  /** 이 기온 이상이면 여름철(열지수) 공식 */
  summerMinTemp: 25,
  /** 이 기온 이하면 겨울철(풍냉) 공식 */
  winterMaxTemp: 10,
  /** 겨울철 공식 최소 풍속(m/s). 미만이면 기온을 그대로 쓴다 */
  winterMinWindMs: 1.3,
} as const;

/**
 * 고소 작업(`elevated`) 보정.
 * 옥상·철탑은 같은 풍속이라도 추락·낙하 위험이 커서 강풍 판정을 한 단계 올린다.
 * 다만 완전 무풍 구간까지 경고로 올리면 경보 피로가 생기므로 '주의' 이상일 때만 승격한다.
 */
export const ELEVATED_WIND_ESCALATE_FROM = WIND_THRESHOLDS.caution;

/** 캐시 TTL(ms). 소스별 갱신 주기에 맞춘다 (CR-004 §8.1) */
export const CACHE_TTL_MS = {
  vilage: 3 * 60 * 60 * 1000,
  ncst: 50 * 60 * 1000,
  ultra: 50 * 60 * 1000,
  warn: 10 * 60 * 1000,
  typhoon: 60 * 60 * 1000,
} as const;

export const DISCLAIMER =
  "기상청 예보 기반 참고값입니다. 법정 기준은 작업장소에서 실측한 체감온도이며, 본 값은 이를 대체하지 않습니다.";
