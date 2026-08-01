"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import type { VworldMapHandle } from "@/features/gpsmap/components/vworld-map-pane";

/*
 * Leaflet은 window에 의존한다. 정적 프리렌더에 걸리지 않게 클라이언트에서만 받는다.
 * 지적도 화면을 켜기 전까지는 번들도 내려받지 않는다.
 */
const VworldMapPane = dynamic(
  () =>
    import("@/features/gpsmap/components/vworld-map-pane").then(
      (m) => m.VworldMapPane,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-slate-950 text-[11px] text-slate-400">
        지적도 불러오는 중...
      </div>
    ),
  },
);

/** 카카오 레벨 → Leaflet 줌 (`/gpsmap`과 같은 환산식). */
const leafletZoomFromKakaoLevel = (level: number) =>
  Math.max(7, Math.min(20, 20 - Math.round(level || 3)));

/**
 * 지도 영역 하단에 브이월드 지적도 화면을 띄운다.
 *
 * 조회 결과(`placeSearch`)를 따라 이동하고 필지 경계를 그린다.
 * 카카오맵을 사용자가 드래그한 것까지 따라가지는 않는다 — 지도 인스턴스는
 * `KakaoMapCanvas`가 들고 있고, 양방향 동기화는 그 소유권을 밖으로 꺼내야 한다.
 */
export function VworldPaneOverlay() {
  const paneRef = useRef<VworldMapHandle>(null);
  const isOpen = useMapMarkerStore((state) => state.isVworldPaneOpen);
  const setOpen = useMapMarkerStore((state) => state.setVworldPaneOpen);
  const placeSearch = useMapMarkerStore((state) => state.placeSearch);

  useEffect(() => {
    if (!isOpen || !placeSearch) return;
    // 페인이 막 열렸을 때는 컨테이너 크기가 0이라 한 박자 뒤에 잡아 준다.
    const timer = window.setTimeout(() => {
      paneRef.current?.invalidateSize();
      paneRef.current?.setView(
        placeSearch.center.lat,
        placeSearch.center.lng,
        leafletZoomFromKakaoLevel(3),
      );
      paneRef.current?.setParcels(
        placeSearch.parcels.flatMap((parcel) => parcel.rings),
      );
    }, 120);
    return () => window.clearTimeout(timer);
  }, [isOpen, placeSearch]);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 h-1/2 border-t border-slate-700 bg-slate-950">
      <VworldMapPane ref={paneRef} />
      <button
        type="button"
        onClick={() => setOpen(false)}
        title="지적도 화면 닫기"
        className="absolute right-3 top-3 z-[700] flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-950/90 text-slate-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
