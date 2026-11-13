"use client";

import { useEffect, useRef, useState } from "react";
import { runSingleLookup, type GpsLookupResult } from "@/features/gpsmap/lib/lookup";

/**
 * 마커 좌표의 GPSMAP 정보(역주소·PNU·필지·건축물대장)를 버튼으로 열 때만 조회한다.
 * 같은 좌표는 캐시로 재호출을 막고, 마커·모달이 바뀌면 접고 상태를 비운다(캐시는 유지).
 */
export function useMarkerGpsInfo(
  marker: { lat: number; lng: number } | undefined,
  resetKey: { isDetailOpen: boolean; selectedMarkerId: string | null },
) {
  const [gpsInfo, setGpsInfo] = useState<GpsLookupResult | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  // 좌표·주소 변환 + 건축물대장을 하나로 묶은 펼침 여부
  const [openGps, setOpenGps] = useState(false);
  const gpsCacheRef = useRef<Map<string, GpsLookupResult>>(new Map());

  useEffect(() => {
    setOpenGps(false);
    setGpsInfo(null);
    setGpsError(null);
    setGpsLoading(false);
  }, [resetKey.isDetailOpen, resetKey.selectedMarkerId]);

  const loadGpsInfo = async () => {
    if (!marker) return;
    const { lat, lng } = marker;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setGpsInfo(null);
      setGpsError("좌표 정보가 없어 조회할 수 없습니다.");
      return;
    }
    const key = `${lat},${lng}`;
    const cached = gpsCacheRef.current.get(key);
    if (cached) {
      setGpsInfo(cached);
      setGpsError(null);
      setGpsLoading(false);
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    setGpsInfo(null);
    try {
      const info = await runSingleLookup(`${lat}, ${lng}`);
      gpsCacheRef.current.set(key, info);
      setGpsInfo(info);
    } catch {
      setGpsInfo(null);
      setGpsError("좌표·주소 변환 정보를 불러오지 못했습니다.");
    } finally {
      setGpsLoading(false);
    }
  };

  // 펼치기/숨기기 토글: 펼칠 때 아직 조회 전이면 조회를 시작한다.
  const toggleGps = () => {
    const willOpen = !openGps;
    setOpenGps(willOpen);
    if (willOpen && !gpsInfo && !gpsLoading) {
      void loadGpsInfo();
    }
  };

  return { gpsInfo, gpsLoading, gpsError, openGps, toggleGps };
}
