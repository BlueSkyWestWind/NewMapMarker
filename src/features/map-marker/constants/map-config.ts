export const DEFAULT_MAP_CENTER = {
  lat: 35.159542,
  lng: 126.8526012,
} as const;

export const DEFAULT_MAP_LEVEL = 6;

/** HYBRID/SKYVIEW 기준. ROADMAP은 최소 1 */
export const MIN_MAP_LEVEL = 0;
export const MAX_MAP_LEVEL = 14;

export const MAP_MARKER_QUERY_KEY = ["map-marker", "markers"] as const;

export const AUTH_SESSION_QUERY_KEY = ["map-marker", "auth-session"] as const;

export const KAKAO_SDK_LIBRARIES = "services,clusterer";

/** 축전지 스펙 기본값 (엑셀 미입력·DB null 시 사용) */
export const DEFAULT_BATTERY_CAPACITY = 600;
export const DEFAULT_BATTERY_QUANTITY = 12;
