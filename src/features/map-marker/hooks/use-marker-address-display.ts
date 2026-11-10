"use client";

import { useEffect, useState } from "react";
import type {
  MarkerAddressDisplay,
  RoadAddressDisplay,
} from "@/features/map-marker/lib/marker-address";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";

interface Fetched {
  markerId: string;
  display: MarkerAddressDisplay;
  road: RoadAddressDisplay;
}

/**
 * 상세 화면에 보여 줄 마커주소와 도로명 주소. 저장된 값이 있으면 그대로 쓰고, 없으면(예전에 등록한
 * 마커) 좌표를 주소로 바꿔 확인한다.
 * - 마커주소: 등록 주소와 같은 곳이면 등록 주소(지번 우선), 다르면 좌표의 실제 주소.
 * - 도로명 주소: 등록 주소와 같은 곳일 때만 좌표의 도로명 주소.
 * 화면에 보이기만 하고 DB에는 쓰지 않는다. 주소 확인 모듈은 필요할 때만 불러온다.
 */
export function useMarkerAddressDisplay(marker: EquipmentMarker | undefined): {
  text: string;
  roadText: string;
  isLoading: boolean;
} {
  const [fetched, setFetched] = useState<Fetched | null>(null);

  const markerId = marker?.id;
  const stored = marker?.markerAddress?.trim() ?? "";
  const storedRoad = marker?.roadAddress?.trim() ?? "";
  const lat = marker?.lat;
  const lng = marker?.lng;
  const jibunAddress = marker?.jibunAddress ?? "";
  const roadAddress = marker?.roadAddress ?? "";
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const needsLookup = markerId !== undefined && (!stored || !storedRoad) && hasCoords;

  useEffect(() => {
    if (!needsLookup || markerId === undefined || lat === undefined || lng === undefined) return;

    let cancelled = false;
    void (async () => {
      const [
        { reverseGeocode },
        { isSameAddress },
        { pickMarkerAddressDisplay, pickRoadAddressDisplay },
      ] = await Promise.all([
        import("@/features/map-marker/lib/geocode"),
        import("@/features/map-marker/lib/address-compare"),
        import("@/features/map-marker/lib/marker-address"),
      ]);
      const actual = await reverseGeocode(lat, lng);
      if (cancelled) return;
      const registered = { jibunAddress, roadAddress };
      const isSame = isSameAddress(jibunAddress || roadAddress, actual);
      const display = pickMarkerAddressDisplay({ stored: "", registered, actual, isSame });
      const road = pickRoadAddressDisplay({ stored: "", actual, isSame });
      setFetched({ markerId, display, road });
    })();

    return () => {
      cancelled = true;
    };
  }, [needsLookup, markerId, lat, lng, jibunAddress, roadAddress]);

  const ready = fetched !== null && fetched.markerId === markerId ? fetched : null;
  return {
    text: stored || (ready ? ready.display.text : ""),
    roadText: storedRoad || (ready ? ready.road.text : ""),
    isLoading: needsLookup && ready === null,
  };
}
