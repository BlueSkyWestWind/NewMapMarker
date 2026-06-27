'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MapMode, MarkerFilterState, MarkerRecord } from '@/features/map-marker/types/marker';

interface MapMarkerUiState {
  mode: MapMode;
  isSidebarOpen: boolean;
  isClusteringEnabled: boolean;
  isCadastralMode: boolean;
  markerListFilter: string;
  filters: MarkerFilterState;
  pendingEquipmentMarkers: MarkerRecord[];
  pendingBatteryMarkers: MarkerRecord[];
  setMode: (mode: MapMode) => void;
  toggleSidebar: () => void;
  setClusteringEnabled: (enabled: boolean) => void;
  setCadastralMode: (enabled: boolean) => void;
  setMarkerListFilter: (value: string) => void;
  setFilters: (filters: MarkerFilterState) => void;
  addPendingMarkers: (mode: MapMode, markers: MarkerRecord[]) => void;
  removePendingMarkers: (mode: MapMode, ids: string[]) => void;
  clearPendingMarkers: (mode: MapMode) => void;
  toggleFilterValue: (
    type: 'year' | 'business' | 'color' | 'tag',
    value: string,
  ) => void;
  selectAllFilterValues: (
    type: 'year' | 'business' | 'color' | 'tag',
    values: string[],
  ) => void;
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
      mode: 'equipment',
      isSidebarOpen: true,
      isClusteringEnabled: true,
      isCadastralMode: false,
      markerListFilter: '',
      filters: emptyFilterState,
      pendingEquipmentMarkers: [],
      pendingBatteryMarkers: [],
      setMode: (mode) =>
        set((state) =>
          state.mode === mode
            ? state
            : { mode, filters: emptyFilterState },
        ),
      toggleSidebar: () =>
        set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setClusteringEnabled: (enabled) => set({ isClusteringEnabled: enabled }),
      setCadastralMode: (enabled) => set({ isCadastralMode: enabled }),
      setMarkerListFilter: (value) => set({ markerListFilter: value }),
      setFilters: (filters) => set({ filters }),
      addPendingMarkers: (mode, markers) =>
        set((state) =>
          mode === 'equipment'
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
          mode === 'equipment'
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
          mode === 'equipment'
            ? { pendingEquipmentMarkers: [] }
            : { pendingBatteryMarkers: [] },
        ),
      toggleFilterValue: (type, value) => {
        const filters = get().filters;
        const keyMap = {
          year: 'selectedYears',
          business: 'selectedBusinesses',
          color: 'selectedColors',
          tag: 'selectedTags',
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
          year: 'selectedYears',
          business: 'selectedBusinesses',
          color: 'selectedColors',
          tag: 'selectedTags',
        } as const;
        const key = keyMap[type];
        set({
          filters: {
            ...filters,
            [key]: new Set(values),
          },
        });
      },
    }),
    {
      name: 'map-marker-ui',
      partialize: (state) => ({
        mode: state.mode,
        isClusteringEnabled: state.isClusteringEnabled,
        isCadastralMode: state.isCadastralMode,
      }),
    },
  ),
);
