"use client";

import { match } from "ts-pattern";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ClusterIconStyle } from "@/features/map-marker/lib/cluster-pie";
import type { PlaceSearchResult } from "@/features/map-marker/lib/parcel-boundary";
import type {
  MapMode,
  MarkerFilterState,
  MarkerRecord,
  StagedErpUpload,
} from "@/features/map-marker/types/marker";

interface MapMarkerUiState {
  mode: MapMode;
  isSidebarOpen: boolean;
  isClusteringEnabled: boolean;
  clusterIconStyle: ClusterIconStyle;
  isCadastralMode: boolean;
  markerListFilter: string;
  filters: MarkerFilterState;
  pendingEquipmentMarkers: MarkerRecord[];
  pendingBatteryMarkers: MarkerRecord[];
  /** 위치 모드 전용 — persist 하지 않음 (새로고침 시 소멸) */
  pendingLocationMarkers: MarkerRecord[];
  /** 위치등록(공정관리) 업로드 미리보기 대기분 — persist 안 함. [적용] 시 DB 커밋 */
  stagedErpUpload: StagedErpUpload | null;
  selectedMarkerId: string | null;
  selectedMarkerIds: string[];
  /** 캡처 중 정보창을 마커에서 떨어뜨려 배치 */
  isInfoWindowCaptureMode: boolean;
  isDetailOpen: boolean;
  isEditOpen: boolean;
  isRoadviewOpen: boolean;
  roadviewPosition: { lat: number; lng: number; name: string } | null;
  /** 장소 검색으로 조회한 필지 경계(지도에 폴리곤으로 표시). persist 안 함 */
  placeSearch: PlaceSearchResult | null;
  setMode: (mode: MapMode) => void;
  toggleSidebar: () => void;
  setClusteringEnabled: (enabled: boolean) => void;
  setClusterIconStyle: (style: ClusterIconStyle) => void;
  setCadastralMode: (enabled: boolean) => void;
  setMarkerListFilter: (value: string) => void;
  setFilters: (filters: MarkerFilterState) => void;
  addPendingMarkers: (mode: MapMode, markers: MarkerRecord[]) => void;
  removePendingMarkers: (mode: MapMode, ids: string[]) => void;
  clearPendingMarkers: (mode: MapMode) => void;
  setStagedErpUpload: (payload: StagedErpUpload | null) => void;
  setSelectedMarkerId: (id: string | null) => void;
  setSelectedMarkerIds: (ids: string[]) => void;
  setInfoWindowCaptureMode: (enabled: boolean) => void;
  toggleSelectedMarkerId: (id: string) => void;
  clearSelectedMarkers: () => void;
  updatePendingMarker: (
    mode: MapMode,
    id: string,
    updates: Partial<MarkerRecord>,
  ) => void;
  toggleFilterValue: (
    type: "year" | "business" | "color" | "tag",
    value: string,
  ) => void;
  selectAllFilterValues: (
    type: "year" | "business" | "color" | "tag",
    values: string[],
  ) => void;
  openDetailModal: (id: string) => void;
  openEditModal: (id: string | null) => void;
  openRoadview: (lat: number, lng: number, name: string) => void;
  setPlaceSearch: (result: PlaceSearchResult | null) => void;
  closeAllModals: () => void;
}

const emptyFilterState: MarkerFilterState = {
  selectedYears: new Set(),
  selectedBusinesses: new Set(),
  selectedColors: new Set(),
  selectedTags: new Set(),
  selectedCapacities: new Set(),
  selectedQuantities: new Set(),
  selectedStations: new Set(),
};

export { emptyFilterState };

function getPendingKey(mode: MapMode) {
  return match(mode)
    .with("equipment", () => "pendingEquipmentMarkers" as const)
    .with("battery", () => "pendingBatteryMarkers" as const)
    .with("location", () => "pendingLocationMarkers" as const)
    .exhaustive();
}

export const useMapMarkerStore = create<MapMarkerUiState>()(
  persist(
    (set, get) => ({
      mode: "equipment",
      isSidebarOpen: true,
      isClusteringEnabled: true,
      clusterIconStyle: "donut",
      isCadastralMode: false,
      markerListFilter: "",
      filters: emptyFilterState,
      pendingEquipmentMarkers: [],
      pendingBatteryMarkers: [],
      pendingLocationMarkers: [],
      stagedErpUpload: null,
      selectedMarkerId: null,
      selectedMarkerIds: [],
      isInfoWindowCaptureMode: false,
      isDetailOpen: false,
      isEditOpen: false,
      isRoadviewOpen: false,
      roadviewPosition: null,
      placeSearch: null,
      setMode: (mode) =>
        set((state) =>
          state.mode === mode
            ? state
            : {
                mode,
                filters: emptyFilterState,
                selectedMarkerId: null,
                selectedMarkerIds: [],
              },
        ),
      toggleSidebar: () =>
        set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setClusteringEnabled: (enabled) => set({ isClusteringEnabled: enabled }),
      setClusterIconStyle: (style) => set({ clusterIconStyle: style }),
      setCadastralMode: (enabled) => set({ isCadastralMode: enabled }),
      setMarkerListFilter: (value) => set({ markerListFilter: value }),
      setFilters: (filters) => set({ filters }),
      addPendingMarkers: (mode, markers) =>
        set((state) => {
          const key = getPendingKey(mode);
          return { [key]: [...state[key], ...markers] };
        }),
      removePendingMarkers: (mode, ids) =>
        set((state) => {
          const key = getPendingKey(mode);
          return {
            [key]: state[key].filter((marker) => !ids.includes(marker.id)),
          };
        }),
      clearPendingMarkers: (mode) => set({ [getPendingKey(mode)]: [] }),
      setStagedErpUpload: (payload) => set({ stagedErpUpload: payload }),
      setSelectedMarkerId: (id) =>
        set({
          selectedMarkerId: id,
          selectedMarkerIds: id ? [id] : [],
        }),
      setSelectedMarkerIds: (ids) =>
        set({
          selectedMarkerIds: ids,
          selectedMarkerId: ids[ids.length - 1] ?? null,
        }),
      setInfoWindowCaptureMode: (enabled) =>
        set({ isInfoWindowCaptureMode: enabled }),
      toggleSelectedMarkerId: (id) =>
        set((state) => {
          const isSelected = state.selectedMarkerIds.includes(id);
          const selectedMarkerIds = isSelected
            ? state.selectedMarkerIds.filter((markerId) => markerId !== id)
            : [...state.selectedMarkerIds, id];
          const selectedMarkerId =
            selectedMarkerIds[selectedMarkerIds.length - 1] ?? null;
          return { selectedMarkerIds, selectedMarkerId };
        }),
      clearSelectedMarkers: () =>
        set({
          selectedMarkerId: null,
          selectedMarkerIds: [],
        }),
      updatePendingMarker: (mode, id, updates) =>
        set((state) => {
          const key = getPendingKey(mode);
          return {
            [key]: state[key].map((marker) =>
              marker.id === id ? { ...marker, ...updates } : marker,
            ),
          };
        }),
      toggleFilterValue: (type, value) => {
        const filters = get().filters;
        const keyMap = {
          year: "selectedYears",
          business: "selectedBusinesses",
          color: "selectedColors",
          tag: "selectedTags",
        } as const;
        const key = keyMap[type];
        const nextSet = new Set(filters[key]);
        if (nextSet.has(value)) {
          nextSet.delete(value);
        } else {
          nextSet.add(value);
        }
        set({
          filters: {
            ...filters,
            [key]: nextSet,
          },
        });
      },
      selectAllFilterValues: (type, values) => {
        const filters = get().filters;
        const keyMap = {
          year: "selectedYears",
          business: "selectedBusinesses",
          color: "selectedColors",
          tag: "selectedTags",
        } as const;
        const key = keyMap[type];
        set({
          filters: {
            ...filters,
            [key]: new Set(values),
          },
        });
      },
      openDetailModal: (id) =>
        set({
          selectedMarkerId: id,
          selectedMarkerIds: [id],
          isDetailOpen: true,
          isEditOpen: false,
        }),
      openEditModal: (id) =>
        set({
          selectedMarkerId: id,
          selectedMarkerIds: id ? [id] : [],
          isEditOpen: true,
          isDetailOpen: false,
        }),
      openRoadview: (lat, lng, name) =>
        set({
          roadviewPosition: { lat, lng, name },
          isRoadviewOpen: true,
        }),
      setPlaceSearch: (result) => set({ placeSearch: result }),
      closeAllModals: () =>
        set({
          selectedMarkerId: null,
          selectedMarkerIds: [],
          isDetailOpen: false,
          isEditOpen: false,
          isRoadviewOpen: false,
          roadviewPosition: null,
        }),
    }),
    {
      name: "map-marker-ui",
      partialize: (state) => ({
        mode: state.mode,
        isClusteringEnabled: state.isClusteringEnabled,
        clusterIconStyle: state.clusterIconStyle,
        isCadastralMode: state.isCadastralMode,
      }),
    },
  ),
);
