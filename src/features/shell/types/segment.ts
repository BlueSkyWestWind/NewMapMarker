import type { MapMode } from "@/features/map-marker/types/marker";

/**
 * 지도 패널의 세그먼트.
 *
 * `converter`·`cctv`·`groups`는 데이터 도메인이 아니라 **화면**이다.
 * `MapMode`에 값을 더하지 않은 이유는 스토어·필터·오버레이·백업이 전부 그 타입에 묶여 있어서다.
 */
export type MapSegment =
  | "equipment"
  | "battery"
  | "location"
  | "cctv"
  | "converter"
  | "groups";

/** 일정관리의 하위 화면. 지도 모드와 무관하다(`MapMode`·스토어에 얽히지 않는다). */
export type ScheduleSegment = "facility";

/** 사이드바 하위 메뉴 키: 지도 세그먼트 또는 일정관리 하위 화면. */
export type NavSubKey = MapSegment | ScheduleSegment;

export function isMapSegment(key: NavSubKey): key is MapSegment {
  return key !== "facility";
}

/** 세그먼트가 쓰는 지도 모드. */
export function modeOfSegment(segment: MapSegment): MapMode {
  if (segment === "cctv") return "equipment";
  if (segment === "converter" || segment === "groups") return "location";
  return segment;
}

/** 지도 모드에 대응하는 기본 세그먼트(변환기는 사용자가 직접 고른 경우에만 열린다). */
export function segmentOfMode(mode: MapMode): MapSegment {
  return mode === "weather" ? "equipment" : mode;
}
