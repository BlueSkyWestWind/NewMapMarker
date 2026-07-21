import type { MarkerRecord } from "@/features/map-marker/types/marker";

export interface ModifierKeysState {
  ctrl: boolean;
  shift: boolean;
}

/** parentMarkerId가 있으면 대표 국소의 서브 마커다. */
export function isEquipmentSubMarker(marker: {
  parentMarkerId?: string | null;
}) {
  return Boolean(marker.parentMarkerId);
}

/** 지도에 찍을 수 있는 좌표인지 검증. (0,0)·비유한 값 제외. */
export function isPlottableCoordinate(lat: number, lng: number) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
  );
}

/** 마커 전체가 보이도록 지도 범위를 맞춘다. */
export function fitMapToMarkers(map: KakaoMap, plottedMarkers: MarkerRecord[]) {
  if (!window.kakao?.maps || plottedMarkers.length === 0) return;

  const bounds = new window.kakao.maps.LatLngBounds();
  plottedMarkers.forEach((marker) => {
    bounds.extend(new window.kakao.maps.LatLng(marker.lat, marker.lng));
  });
  map.setBounds(bounds);
}

/** 열려 있는 커스텀 오버레이를 모두 닫고 맵을 비운다. */
export function closeAllOverlays(overlays: Map<string, KakaoCustomOverlay>) {
  overlays.forEach((overlay) => overlay.setMap(null));
  overlays.clear();
}

/** Ctrl/Shift/Meta 조합이면 다중 선택 제스처로 판정. */
export function isMultiSelectGesture(
  mouseEvent: MouseEvent | undefined,
  modifierKeys: ModifierKeysState,
) {
  return Boolean(
    mouseEvent?.ctrlKey ||
      mouseEvent?.metaKey ||
      mouseEvent?.shiftKey ||
      modifierKeys.ctrl ||
      modifierKeys.shift,
  );
}
