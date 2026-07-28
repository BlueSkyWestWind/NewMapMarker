/**
 * ITS 국가교통정보센터 CCTV Open API 설정.
 * 값은 「광주·전남 도로 구간별 CCTV 매핑 시스템 구축 계획」 §2.2 · §10.1 기준.
 */

/**
 * 광주·전남 경계상자(WGS84). 계획서 §2.2 값 그대로.
 *
 * 사각형이라 전북 남부·경남 서부가 섞여 들어온다.
 * 정확한 시군구 귀속은 행정경계 폴리곤 클리핑이 있어야 하므로(§5.1),
 * 현재는 조회 범위로만 쓰고 결과를 지역별로 나누지 않는다.
 */
export const GWANGJU_JEONNAM_BBOX = {
  minX: 125.0,
  maxX: 127.95,
  minY: 33.85,
  maxY: 35.5,
} as const;

export type BoundingBox = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

/** ITS 도로 종별 코드 */
export const ROAD_TYPES = [
  { code: "ex", label: "고속도로" },
  { code: "its", label: "국도" },
] as const;

export type RoadTypeCode = (typeof ROAD_TYPES)[number]["code"];

export function roadTypeLabel(code: string): string {
  return ROAD_TYPES.find((t) => t.code === code)?.label ?? code;
}

/** 대상 행정구역 — 계획서 §2.1. 현재는 표시·안내용이며 조회 필터로 쓰지 않는다. */
export const TARGET_REGIONS = {
  광주광역시: ["동구", "서구", "남구", "북구", "광산구"],
  전라남도: [
    "목포시", "여수시", "순천시", "나주시", "광양시",
    "담양군", "곡성군", "구례군", "고흥군", "보성군",
    "화순군", "장흥군", "강진군", "해남군", "영암군",
    "무안군", "함평군", "영광군", "장성군", "완도군",
    "진도군", "신안군",
  ],
} as const;

export const TARGET_SGG_COUNT =
  TARGET_REGIONS.광주광역시.length + TARGET_REGIONS.전라남도.length;
