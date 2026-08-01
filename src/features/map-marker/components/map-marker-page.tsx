"use client";

import dynamic from "next/dynamic";
import { useActiveMarkers } from "@/features/map-marker/hooks/use-active-markers";
import {
  STORE_DEFAULT_MODE,
  STORE_DEFAULT_NAV,
  STORE_DEFAULT_SEGMENT,
  useMapMarkerStore,
} from "@/features/map-marker/store/use-map-marker-store";
import { useHasMounted } from "@/hooks/use-has-mounted";
import { AppShell } from "@/features/shell/components/app-shell";
import { KakaoMapCanvas } from "@/features/map-marker/components/map/kakao-map-canvas";
import { VworldPaneOverlay } from "@/features/gpsmap/components/vworld-pane-overlay";

// 모달은 열릴 때만 필요하므로 초기 번들에서 분리(지연 로드)한다.
const RoadviewModal = dynamic(
  () =>
    import("@/features/map-marker/components/modals/roadview-modal").then(
      (m) => m.RoadviewModal,
    ),
  { ssr: false },
);
const MarkerDetailModal = dynamic(
  () =>
    import("@/features/map-marker/components/modals/marker-detail-modal").then(
      (m) => m.MarkerDetailModal,
    ),
  { ssr: false },
);
const MarkerEditModal = dynamic(
  () =>
    import("@/features/map-marker/components/modals/marker-edit-modal").then(
      (m) => m.MarkerEditModal,
    ),
  { ssr: false },
);
/*
 * CCTV 영상 모달은 조회 패널이 아니라 여기 둔다.
 * 패널은 메뉴를 옮기면 언마운트되는데, 그러면 지도의 CCTV 마커를 눌러도 영상이 뜨지 않는다.
 * 마커는 메뉴와 무관하게 남으므로 모달도 그래야 한다.
 */
const CctvVideoModal = dynamic(
  () =>
    import("@/features/cctv/components/cctv-video-modal").then(
      (m) => m.CctvVideoModal,
    ),
  { ssr: false },
);

export function MapMarkerPage() {
  const hasMounted = useHasMounted();
  const storedMode = useMapMarkerStore((state) => state.mode);
  const storedActiveNav = useMapMarkerStore((state) => state.activeNav);
  const storedSegment = useMapMarkerStore((state) => state.mapSegment);
  const selectedCctv = useMapMarkerStore((state) => state.selectedCctv);
  const setSelectedCctv = useMapMarkerStore((state) => state.setSelectedCctv);

  /*
   * **하이드레이션 경계는 여기 한 곳뿐이다.**
   *
   * `mode`·`activeNav`는 zustand persist 대상이라 클라이언트 첫 렌더에 이미
   * localStorage 값으로 복원돼 있다. 서버는 기본값으로 HTML을 만들었으므로
   * 그대로 쓰면 트리가 통째로 어긋난다(레일 활성 항목·패널 내용·건수 라벨).
   * 마운트 전에는 서버와 같은 기본값을 그리고, 마운트 후 실제 값으로 넘어간다.
   *
   * 아래로 내려가는 값은 전부 이 안전값이다 — 지도까지 같은 값을 봐야
   * 플로팅 컨트롤의 모드별 버튼도 어긋나지 않는다.
   */
  const mode = hasMounted ? storedMode : STORE_DEFAULT_MODE;
  const activeNav = hasMounted ? storedActiveNav : STORE_DEFAULT_NAV;
  const segment = hasMounted ? storedSegment : STORE_DEFAULT_SEGMENT;
  // 이 훅은 스토어에 쓰는 부수효과가 있어 트리에서 **한 번만** 부른다.
  const {
    markers,
    filterOptions,
    effectiveFilters,
    invalidCoordinateCount,
    equipmentCount,
    batteryCount,
    locationCount,
    isLoading,
    isError,
    error,
    refetch,
  } = useActiveMarkers();

  return (
    <>
      <AppShell
        mode={mode}
        activeNav={activeNav}
        segment={segment}
        markers={markers}
        filterOptions={filterOptions}
        filters={effectiveFilters}
        equipmentCount={equipmentCount}
        batteryCount={batteryCount}
        locationCount={locationCount}
        invalidCoordinateCount={invalidCoordinateCount}
        isLoading={isLoading}
      >
        {isError && mode !== "location" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-rose-300">
            <p>데이터 로드 실패: {error?.message}</p>
            <button
              type="button"
              className="rounded-md bg-slate-800 px-3 py-1.5 text-slate-100"
              onClick={() => refetch()}
            >
              다시 시도
            </button>
          </div>
        ) : (
          <>
            <KakaoMapCanvas
              markers={markers}
              mode={mode}
              filters={effectiveFilters}
            />
            <VworldPaneOverlay />
          </>
        )}
      </AppShell>

      <RoadviewModal />
      <MarkerDetailModal />
      <MarkerEditModal />
      <CctvVideoModal cctv={selectedCctv} onClose={() => setSelectedCctv(null)} />
    </>
  );
}
