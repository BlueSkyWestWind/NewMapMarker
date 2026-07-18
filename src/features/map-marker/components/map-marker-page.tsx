"use client";

import dynamic from "next/dynamic";
import { useActiveMarkers } from "@/features/map-marker/hooks/use-active-markers";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { MapSidebar } from "@/features/map-marker/components/sidebar/map-sidebar";
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

export function MapMarkerPage() {
  const mode = useMapMarkerStore((state) => state.mode);
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
    <div className="relative flex h-[100dvh] w-full overflow-hidden bg-slate-950">
      <MapSidebar
        markers={markers}
        filterOptions={filterOptions}
        filters={effectiveFilters}
        equipmentCount={equipmentCount}
        batteryCount={batteryCount}
        locationCount={locationCount}
        invalidCoordinateCount={invalidCoordinateCount}
        isLoading={isLoading}
      />
      <main className="relative min-w-0 flex-1">
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
      </main>

      <RoadviewModal />
      <MarkerDetailModal />
      <MarkerEditModal />
    </div>
  );
}
