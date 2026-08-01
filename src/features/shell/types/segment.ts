import type { MapMode } from "@/features/map-marker/types/marker";

/**
 * 지도 패널의 세그먼트.
 *
 * `converter`는 데이터 도메인이 아니라 **화면**이다. `MapMode`에 값을 더하지 않은 이유는
 * 스토어·필터·오버레이·백업이 전부 그 타입에 묶여 있어서다 — 변환기는 지도에
 * 임시 위치 마커를 찍으므로 모드는 `location`을 그대로 쓴다.
 */
export type MapSegment = "equipment" | "battery" | "location" | "converter";

/** 세그먼트가 쓰는 지도 모드. */
export function modeOfSegment(segment: MapSegment): MapMode {
  return segment === "converter" ? "location" : segment;
}

/** 지도 모드에 대응하는 기본 세그먼트(변환기는 사용자가 직접 고른 경우에만 열린다). */
export function segmentOfMode(mode: MapMode): MapSegment {
  return mode === "weather" ? "equipment" : mode;
}
