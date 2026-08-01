"use client";

import dynamic from "next/dynamic";
import { useActiveMarkers } from "@/features/map-marker/hooks/use-active-markers";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { AppShell } from "@/features/shell/components/app-shell";
import { KakaoMapCanvas } from "@/features/map-marker/components/map/kakao-map-canvas";

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
  const mode = useMapMarkerStore((state) => state.mode);
  const selectedCctv = useMapMarkerStore((state) => state.selectedCctv);
  const setSelectedCctv = useMapMarkerStore((state) => state.setSelectedCctv);
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
          <KakaoMapCanvas
            markers={markers}
            mode={mode}
            filters={effectiveFilters}
          />
        )}
      </AppShell>

      <RoadviewModal />
      <MarkerDetailModal />
      <MarkerEditModal />
      <CctvVideoModal cctv={selectedCctv} onClose={() => setSelectedCctv(null)} />
    </>
  );
}
