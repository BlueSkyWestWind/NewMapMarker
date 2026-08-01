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
import type { SiteMatch } from "@/features/worksite-weather/types/weather";
import type { CctvItem } from "@/features/cctv/types/cctv";
import type { NavKey } from "@/features/shell/types/nav";

/** 세그먼트로 고를 수 있는 도메인. `weather`는 대시보드 전용이라 제외한다. */
type DomainMode = Exclude<MapMode, "weather">;

interface MapMarkerUiState {
  mode: MapMode;
  /** 현재 메뉴(좌측 레일). 화면 전환의 최상위 축 */
  activeNav: NavKey;
  /**
   * 마지막으로 고른 도메인. 대시보드(weather)에 다녀와도 원래 도메인으로 돌아오기 위해 기억한다.
   * 이게 없으면 대시보드→지도 복귀가 항상 장비로 떨어진다.
   */
  lastDomainMode: DomainMode;
  setActiveNav: (nav: NavKey) => void;
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
  /** 지도에 표시할 도로 CCTV 목록(장비 모드). 조회 결과라 persist 하지 않는다 */
  cctvMarkers: CctvItem[];
  setCctvMarkers: (items: CctvItem[]) => void;
  /** CCTV 마커 표시 여부. 지도 우하단 토글로 켜고 끈다 */
  isCctvVisible: boolean;
  toggleCctvVisible: () => void;
  /** 영상 모달을 띄울 CCTV. null이면 닫힘 */
  selectedCctv: CctvItem | null;
  setSelectedCctv: (item: CctvItem | null) => void;
  /** 날씨 탭에 저장된 오늘의 작업 국소 목록 */
  savedWeatherSites: SiteMatch[];
  saveWeatherSites: (sites: SiteMatch[]) => void;
  clearSavedWeatherSites: () => void;
  removeSavedWeatherSite: (id: string) => void;
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

/**
 * 서버 렌더가 쓰는 초기값. persist 복원 전 화면은 반드시 이 값으로 그려야
 * 하이드레이션이 어긋나지 않는다(`AppShell` 참조).
 */
export const STORE_DEFAULT_MODE: MapMode = "equipment";
export const STORE_DEFAULT_NAV: NavKey = "dashboard";

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
    .with("weather", () => "pendingEquipmentMarkers" as const)
    .exhaustive();
}

export const useMapMarkerStore = create<MapMarkerUiState>()(
  persist(
    (set, get) => ({
      mode: STORE_DEFAULT_MODE,
      activeNav: STORE_DEFAULT_NAV,
      lastDomainMode: "equipment",
      /**
       * 메뉴 전환. **필터·선택·CCTV 조회 결과를 보존한다** (계획서 §3.9).
       *
       * `setMode`는 도메인이 바뀌면 필터를 비우는데, 그건 세그먼트를 직접 눌렀을 때의 규칙이다.
       * 대시보드가 weather 모드를 쓰므로 메뉴가 `setMode`를 그대로 호출하면
       * 지도↔대시보드 왕복만으로 필터가 두 번 날아간다.
       */
      setActiveNav: (nav) =>
        set((state) => {
          const nextMode = match(nav)
            .with("dashboard", () => "weather" as MapMode)
            .with("map", () => state.lastDomainMode as MapMode)
            // 마커관리에는 위치 세그먼트가 없다(위치는 지도 전용).
            .with("markers", () =>
              state.lastDomainMode === "location"
                ? ("equipment" as MapMode)
                : (state.lastDomainMode as MapMode),
            )
            .otherwise(() => state.mode);

          return { activeNav: nav, mode: nextMode };
        }),
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
      cctvMarkers: [],
      // 조회하면 바로 보이게 하고, 이후에는 토글로 제어한다
      setCctvMarkers: (items) => set({ cctvMarkers: items }),
      isCctvVisible: true,
      toggleCctvVisible: () => set((state) => ({ isCctvVisible: !state.isCctvVisible })),
      selectedCctv: null,
      setSelectedCctv: (item) => set({ selectedCctv: item }),
      savedWeatherSites: [],
      saveWeatherSites: (sites) => set({ savedWeatherSites: sites }),
      clearSavedWeatherSites: () => set({ savedWeatherSites: [] }),
      removeSavedWeatherSite: (id) =>
        set((state) => ({
          savedWeatherSites: state.savedWeatherSites.filter((s) => s.id !== id),
        })),
      // 세그먼트를 직접 누른 경우다. 도메인이 바뀌면 필터 항목 자체가 달라지므로 초기화한다.
      // 메뉴 이동은 이 함수를 쓰지 않는다 — `setActiveNav` 참조.
      setMode: (mode) =>
        set((state) =>
          state.mode === mode
            ? state
            : {
                mode,
                lastDomainMode:
                  mode === "weather" ? state.lastDomainMode : (mode as DomainMode),
                filters: emptyFilterState,
                selectedMarkerId: null,
                selectedMarkerIds: [],
                cctvMarkers: [],
                selectedCctv: null,
                isCctvVisible: true,
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
        activeNav: state.activeNav,
        lastDomainMode: state.lastDomainMode,
        isClusteringEnabled: state.isClusteringEnabled,
        clusterIconStyle: state.clusterIconStyle,
        isCadastralMode: state.isCadastralMode,
        savedWeatherSites: state.savedWeatherSites,
      }),
    },
  ),
);
