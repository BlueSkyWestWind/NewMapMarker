"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ClusterIconStyle } from "@/features/map-marker/lib/cluster-pie";
import type {
  MapMode,
  MarkerFilterState,
  MarkerRecord,
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
  selectedMarkerId: string | null;
  selectedMarkerIds: string[];
  /** 캡처 중 정보창을 마커에서 떨어뜨려 배치 */
  isInfoWindowCaptureMode: boolean;
  isDetailOpen: boolean;
  isEditOpen: boolean;
  isRoadviewOpen: boolean;
  roadviewPosition: { lat: number; lng: number; name: string } | null;
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
      selectedMarkerId: null,
      selectedMarkerIds: [],
      isInfoWindowCaptureMode: false,
      isDetailOpen: false,
      isEditOpen: false,
      isRoadviewOpen: false,
      roadviewPosition: null,
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
        set((state) =>
          mode === "equipment"
            ? {
                pendingEquipmentMarkers: [
                  ...state.pendingEquipmentMarkers,
                  ...markers,
                ],
              }
            : {
                pendingBatteryMarkers: [
                  ...state.pendingBatteryMarkers,
                  ...markers,
                ],
              },
        ),
      removePendingMarkers: (mode, ids) =>
        set((state) =>
          mode === "equipment"
            ? {
                pendingEquipmentMarkers: state.pendingEquipmentMarkers.filter(
                  (marker) => !ids.includes(marker.id),
                ),
              }
            : {
                pendingBatteryMarkers: state.pendingBatteryMarkers.filter(
                  (marker) => !ids.includes(marker.id),
                ),
              },
        ),
      clearPendingMarkers: (mode) =>
        set(
          mode === "equipment"
            ? { pendingEquipmentMarkers: [] }
            : { pendingBatteryMarkers: [] },
        ),
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
          if (mode === "equipment") {
            return {
              pendingEquipmentMarkers: state.pendingEquipmentMarkers.map((m) =>
                m.id === id ? { ...m, ...updates } : m,
              ),
            };
          } else {
            return {
              pendingBatteryMarkers: state.pendingBatteryMarkers.map((m) =>
                m.id === id ? { ...m, ...updates } : m,
              ),
            };
          }
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
