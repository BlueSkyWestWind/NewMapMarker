"use client";

import { match } from "ts-pattern";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  isStagedReviewMarker,
  moveGroupedPendingMarkers,
} from "@/features/map-marker/lib/erp-review";
import type { ClusterIconStyle } from "@/features/map-marker/lib/cluster-pie";
import type { PlaceSearchResult } from "@/features/map-marker/lib/parcel-boundary";
import type { GpsLookupResult } from "@/features/gpsmap/lib/lookup";
import type {
  MapMode,
  MarkerFilterState,
  MarkerRecord,
  StagedErpUpload,
} from "@/features/map-marker/types/marker";
import type { ScheduleSyncRecord, SiteMatch } from "@/features/worksite-weather/types/weather";
import type { CctvItem } from "@/features/cctv/types/cctv";
import type { NavKey } from "@/features/shell/types/nav";
import {
  modeOfSegment,
  segmentOfMode,
  type MapSegment,
} from "@/features/shell/types/segment";

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
  /** 위치 메뉴에서 표시 중인 목록. persist 하지 않는다 */
  selectedSiteListIds: string[];
  toggleSiteList: (id: string) => void;
  /** 그룹관리 메뉴에서 체크한 묶음 키. persist 하지 않는다 */
  selectedGroupKeys: string[];
  toggleGroupKey: (key: string) => void;
  setGroupKeys: (keys: string[]) => void;
  /** 전체 화면 관리가 열려 있는 묶음 키. null이면 닫힘. persist 하지 않는다 */
  groupManageKey: string | null;
  setGroupManageKey: (key: string | null) => void;
  /** 전체 화면 관리에서 마지막으로 열었던 묶음 키(다시 열 때 이어 본다). persist 하지 않는다 */
  lastGroupManageKey: string | null;
  setLastGroupManageKey: (key: string | null) => void;
  /** 지도 패널의 세그먼트. `converter`는 모드가 아니라 화면이라 별도로 든다. */
  mapSegment: MapSegment;
  setMapSegment: (segment: MapSegment) => void;
  isSidebarOpen: boolean;
  isClusteringEnabled: boolean;
  clusterIconStyle: ClusterIconStyle;
  isCadastralMode: boolean;
  /**
   * VWorld 연속지적도(필지 경계) 폴리곤 표시 여부.
   * 카카오 지적편집도(`isCadastralMode`)와 별개다 — 이쪽은 조회한 필지의 실제 경계선이다.
   */
  isVworldParcelVisible: boolean;
  setVworldParcelVisible: (visible: boolean) => void;
  /**
   * 위치 세그먼트에서 지도를 어떻게 쓸지.
   * `lookup`이면 클릭한 지점을 조회하고, `roadview`면 도로 오버레이를 띄워 로드뷰를 연다.
   * `place`는 위치등록에서 주소를 못 찾은 건을 클릭한 지점에 놓는다.
   * persist 하지 않는다 — 새로고침 후에도 켜져 있으면 평소 클릭이 먹히지 않는다.
   */
  mapPickMode: "off" | "lookup" | "roadview" | "place";
  setMapPickMode: (mode: "off" | "lookup" | "roadview" | "place") => void;
  /** 지도에서 찍은 지점. 변환기 패널이 이걸 보고 조회한다. `at`은 같은 지점 재클릭 구분용 */
  pickedPoint: { lat: number; lng: number; at: number } | null;
  setPickedPoint: (point: { lat: number; lng: number; at: number } | null) => void;
  /** 브이월드 지적도 화면(하단 페인) 표시 여부 */
  isVworldPaneOpen: boolean;
  setVworldPaneOpen: (open: boolean) => void;
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
  /**
   * 메뉴를 떠날 때 그 메뉴의 마커창 선택을 맡겨 두는 곳. 메뉴 간 마커창이 섞이지 않게 한다
   * (대시보드가 펼친 마커창이 지도에 남던 문제). persist 하지 않는다
   */
  selectionByNav: Partial<Record<NavKey, string[]>>;
  /** 캡처 중 정보창을 마커에서 떨어뜨려 배치 */
  isInfoWindowCaptureMode: boolean;
  isDetailOpen: boolean;
  isEditOpen: boolean;
  isRoadviewOpen: boolean;
  roadviewPosition: { lat: number; lng: number; name: string } | null;
  /** 장소 검색으로 조회한 필지 경계(지도에 폴리곤으로 표시). persist 안 함 */
  placeSearch: PlaceSearchResult | null;
  /**
   * 위치/좌표 변환기의 단건 조회 결과. 상단 바 [엑셀] 버튼이 이걸 내려받는다
   * (사이드바 버튼을 지도 상단 바로 옮겼다 — 결과가 사이드바와 상단 바 양쪽에서 필요). persist 안 함
   */
  converterSingleResult: GpsLookupResult | null;
  setConverterSingleResult: (result: GpsLookupResult | null) => void;
  /** 지도에 표시할 도로 CCTV 목록(장비 모드). 조회 결과라 persist 하지 않는다 */
  cctvMarkers: CctvItem[];
  setCctvMarkers: (items: CctvItem[]) => void;
  /** CCTV 마커 표시 여부. 지도 우하단 토글로 켜고 끈다 */
  isCctvVisible: boolean;
  toggleCctvVisible: () => void;
  /** 영상 모달을 띄울 CCTV. null이면 닫힘 */
  selectedCctv: CctvItem | null;
  setSelectedCctv: (item: CctvItem | null) => void;
  /** 장비·축전지·위치 마커 표시 여부. CCTV 탭 등에서 지도 우하단 토글로 켜고 끈다 */
  isMarkersVisible: boolean;
  toggleMarkersVisible: () => void;
  /** 날씨 탭에 저장된 오늘의 작업 국소 목록 */
  savedWeatherSites: SiteMatch[];
  saveWeatherSites: (sites: SiteMatch[]) => void;
  /** 기존 목록을 지우지 않고 덧붙인다(id 중복 제외) — 위치 탭에서 등록할 때 쓴다 */
  addWeatherSites: (sites: SiteMatch[]) => void;
  clearSavedWeatherSites: () => void;
  removeSavedWeatherSite: (id: string) => void;
  /** 지도를 이 국소들이 모두 보이게 맞춰 달라는 요청. nonce가 바뀔 때마다 한 번 처리한다(저장하지 않는다) */
  mapFitRequest: { ids: string[]; nonce: number; arrange: boolean } | null;
  /** `arrange`가 true면 지도를 맞춘 뒤 열린 정보창들이 서로 겹치지 않게 배치한다 */
  requestMapFit: (ids: string[], options?: { arrange?: boolean }) => void;
  /** 대시보드가 열려 있는 동안 true: 지도를 확대·축소·이동할 때마다 열린 정보창을 가장자리 열에 다시 배치한다(저장 안 함) */
  overlayBoardActive: boolean;
  setOverlayBoardActive: (active: boolean) => void;
  /** 시설일정 자동 등록 기록(날짜별로 넣어 본 국소 id) */
  scheduleSync: ScheduleSyncRecord | null;
  /** 시설일정에서 합친 작업 국소 목록과 기록을 한 번에 반영한다 */
  applyScheduleSync: (sites: SiteMatch[], sync: ScheduleSyncRecord) => void;
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
  /** 위치등록 대기 마커를 옮긴다. 같은 그룹(대표·SUB)의 마커도 같은 이동량으로 함께 옮긴다. */
  moveStagedGroup: (id: string, coords: { lat: number; lng: number }) => void;
  toggleFilterValue: (
    type: "year" | "business" | "status" | "color" | "tag",
    value: string,
  ) => void;
  selectAllFilterValues: (
    type: "year" | "business" | "status" | "color" | "tag",
    values: string[],
  ) => void;
  openDetailModal: (id: string) => void;
  openEditModal: (id: string | null) => void;
  openRoadview: (lat: number, lng: number, name: string) => void;
  /** 로드뷰만 닫는다. 열어 둔 마커창(선택)은 그대로 둔다 */
  closeRoadview: () => void;
  setPlaceSearch: (result: PlaceSearchResult | null) => void;
  closeAllModals: () => void;
}

/**
 * 서버 렌더가 쓰는 초기값. persist 복원 전 화면은 반드시 이 값으로 그려야
 * 하이드레이션이 어긋나지 않는다(`AppShell` 참조).
 */
export const STORE_DEFAULT_MODE: MapMode = "equipment";
export const STORE_DEFAULT_NAV: NavKey = "dashboard";
export const STORE_DEFAULT_SEGMENT: MapSegment = "equipment";

/** 들어가면 지도의 일반 마커를 숨기고 시작하는 메뉴. 지도를 직접 쓰지 않는 화면들이다 */
const NAVS_WITHOUT_MARKERS: NavKey[] = [
  "schedule",
  "barcode",
  "backup",
  "settings",
  "accounts",
];

/**
 * 메뉴·세그먼트에 들어갈 때 지도의 일반 마커를 보이고 시작할지.
 * CCTV 세그먼트는 도로 CCTV가 주인공이라 국소 마커를 숨기고 시작한다(우하단 토글로 켤 수 있다).
 */
function startsWithMarkersVisible(nav: NavKey, segment: MapSegment): boolean {
  if (NAVS_WITHOUT_MARKERS.includes(nav)) return false;
  return !(nav === "map" && segment === "cctv");
}

const emptyFilterState: MarkerFilterState = {
  selectedYears: new Set(),
  selectedBusinesses: new Set(),
  selectedStatuses: new Set(),
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
      mapSegment: STORE_DEFAULT_SEGMENT,
      lastDomainMode: "equipment",
      /*
       * 세그먼트를 직접 누른 경우다. 도메인이 바뀌면 필터 항목 자체가 달라지므로 초기화한다.
       * 변환기는 `location`과 같은 모드를 쓰므로 둘 사이를 오갈 때는 아무것도 지우지 않는다.
       */
      setMapSegment: (segment) =>
        set((state) => {
          const nextMode = modeOfSegment(segment);
          const leavingCctv =
            state.mapSegment === "cctv" && segment !== "cctv"
              ? {
                  cctvMarkers: [],
                  selectedCctv: null,
                  isCctvVisible: true,
                }
              : null;
          // CCTV 세그먼트를 드나들 때만 마커 표시를 맞춘다. 같은 세그먼트를 다시 눌러도 토글 상태를 유지한다.
          const markerVisibility =
            (segment === "cctv") !== (state.mapSegment === "cctv")
              ? { isMarkersVisible: startsWithMarkersVisible(state.activeNav, segment) }
              : null;
          if (state.mode === nextMode) {
            return {
              mapSegment: segment,
              ...markerVisibility,
              ...leavingCctv,
            };
          }
          return {
            mapSegment: segment,
            ...markerVisibility,
            mode: nextMode,
            lastDomainMode: nextMode as DomainMode,
            filters: emptyFilterState,
            selectedMarkerId: null,
            selectedMarkerIds: [],
            ...leavingCctv,
          };
        }),
      /**
       * 메뉴 전환. **필터·CCTV 조회 결과를 보존한다** (계획서 §3.9). 마커창 선택은 메뉴별로 따로 둔다.
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
            // 마커관리에는 위치 세그먼트가 없다(위치는 지도 전용). groups 세그먼트면 location 모드.
            .with("markers", () =>
              state.mapSegment === "groups"
                ? ("location" as MapMode)
                : state.lastDomainMode === "location"
                  ? ("equipment" as MapMode)
                  : (state.lastDomainMode as MapMode),
            )
            .otherwise(() => state.mode);

          /*
           * 지도로 돌아올 때는 마지막에 보던 세그먼트를 그대로 살린다 —
           * 변환기·CCTV를 쓰다 대시보드에 다녀오면 보던 세그먼트로 돌아와야 한다.
           * 마커관리도 그룹관리 세그먼트면 그룹관리를 살린다.
           * 다른 메뉴는 도메인만 맞춘다.
           */
          const nextSegment =
            nav === "map" &&
            (state.mapSegment === "converter" || state.mapSegment === "cctv")
              ? state.mapSegment
              : nav === "markers" && state.mapSegment === "groups"
                ? "groups"
                : segmentOfMode(nextMode);

          // 지도를 벗어나면 CCTV 조회 결과를 지운다.
          const leavingCctv =
            nav !== "map" && state.mapSegment === "cctv"
              ? {
                  cctvMarkers: [],
                  selectedCctv: null,
                  isCctvVisible: true,
                }
              : null;

          /*
           * 마커창 선택은 메뉴마다 독립이다. 떠나는 메뉴의 선택을 맡겨 두고, 들어가는 메뉴가
           * 마지막에 열어 둔 선택을 돌려준다(처음이면 빈 선택). 같은 메뉴를 다시 누르면 그대로 둔다.
           */
          const switching = nav !== state.activeNav;
          const nextSelection = switching
            ? (state.selectionByNav[nav] ?? [])
            : state.selectedMarkerIds;
          const selection = switching
            ? {
                selectionByNav: {
                  ...state.selectionByNav,
                  [state.activeNav]: state.selectedMarkerIds,
                },
                selectedMarkerIds: nextSelection,
                selectedMarkerId: nextSelection[nextSelection.length - 1] ?? null,
              }
            : null;

          return {
            activeNav: nav,
            mode: nextMode,
            mapSegment: nextSegment,
            // 마커 숨김 토글은 그 메뉴에서만 유효하다. 다른 메뉴로 가면 다시 보인다.
            // 마커가 주인공이 아닌 메뉴는 이전 메뉴의 마커를 숨기고 시작한다(우하단 토글로 켤 수 있다).
            ...(switching
              ? { isMarkersVisible: startsWithMarkersVisible(nav, nextSegment) }
              : null),
            ...selection,
            ...leavingCctv,
          };
        }),
      isSidebarOpen: true,
      isClusteringEnabled: true,
      clusterIconStyle: "donut",
      isCadastralMode: false,
      isVworldParcelVisible: true,
      setVworldParcelVisible: (visible) =>
        set({ isVworldParcelVisible: visible }),
      mapPickMode: "off",
      setMapPickMode: (mode) => set({ mapPickMode: mode }),
      pickedPoint: null,
      setPickedPoint: (point) => set({ pickedPoint: point }),
      isVworldPaneOpen: false,
      setVworldPaneOpen: (open) => set({ isVworldPaneOpen: open }),
      markerListFilter: "",
      filters: emptyFilterState,
      pendingEquipmentMarkers: [],
      pendingBatteryMarkers: [],
      pendingLocationMarkers: [],
      stagedErpUpload: null,
      selectedMarkerId: null,
      selectedMarkerIds: [],
      selectionByNav: {},
      isInfoWindowCaptureMode: false,
      isDetailOpen: false,
      isEditOpen: false,
      isRoadviewOpen: false,
      roadviewPosition: null,
      placeSearch: null,
      converterSingleResult: null,
      setConverterSingleResult: (result) => set({ converterSingleResult: result }),
      cctvMarkers: [],
      // 조회하면 바로 보이게 하고, 이후에는 토글로 제어한다
      setCctvMarkers: (items) => set({ cctvMarkers: items }),
      isCctvVisible: true,
      toggleCctvVisible: () => set((state) => ({ isCctvVisible: !state.isCctvVisible })),
      selectedCctv: null,
      setSelectedCctv: (item) => set({ selectedCctv: item }),
      isMarkersVisible: true,
      toggleMarkersVisible: () =>
        set((state) => ({ isMarkersVisible: !state.isMarkersVisible })),
      selectedSiteListIds: [],
      toggleSiteList: (id) =>
        set((state) => ({
          selectedSiteListIds: state.selectedSiteListIds.includes(id)
            ? state.selectedSiteListIds.filter((value) => value !== id)
            : [...state.selectedSiteListIds, id],
        })),
      selectedGroupKeys: [],
      toggleGroupKey: (key) =>
        set((state) => ({
          selectedGroupKeys: state.selectedGroupKeys.includes(key)
            ? state.selectedGroupKeys.filter((value) => value !== key)
            : [...state.selectedGroupKeys, key],
        })),
      setGroupKeys: (keys) => set({ selectedGroupKeys: keys }),
      groupManageKey: null,
      setGroupManageKey: (key) => set({ groupManageKey: key }),
      lastGroupManageKey: null,
      setLastGroupManageKey: (key) => set({ lastGroupManageKey: key }),
      savedWeatherSites: [],
      scheduleSync: null,
      mapFitRequest: null,
      overlayBoardActive: false,
      setOverlayBoardActive: (active) => set({ overlayBoardActive: active }),
      requestMapFit: (ids, options) =>
        set((state) => ({
          mapFitRequest: {
            ids,
            nonce: (state.mapFitRequest?.nonce ?? 0) + 1,
            arrange: options?.arrange ?? false,
          },
        })),
      applyScheduleSync: (sites, sync) => set({ savedWeatherSites: sites, scheduleSync: sync }),
      saveWeatherSites: (sites) => set({ savedWeatherSites: sites }),
      addWeatherSites: (sites) =>
        set((state) => {
          const existingIds = new Set(state.savedWeatherSites.map((s) => s.id));
          const additions = sites.filter((s) => !existingIds.has(s.id));
          if (additions.length === 0) return state;
          return {
            savedWeatherSites: [...state.savedWeatherSites, ...additions],
          };
        }),
      // 작업 국소를 지우면 등록할 때 만든 임시 마커도 함께 지운다. 경로 후보에 남지 않게 한다.
      clearSavedWeatherSites: () =>
        set((state) => {
          const tempIds = new Set(
            state.savedWeatherSites.map((site) => site.tempMarkerId ?? site.id),
          );
          return {
            savedWeatherSites: [],
            pendingLocationMarkers: state.pendingLocationMarkers.filter(
              (marker) => !tempIds.has(marker.id),
            ),
          };
        }),
      removeSavedWeatherSite: (id) =>
        set((state) => {
          const site = state.savedWeatherSites.find((s) => s.id === id);
          const tempId = site?.tempMarkerId ?? id;
          return {
            savedWeatherSites: state.savedWeatherSites.filter((s) => s.id !== id),
            pendingLocationMarkers: state.pendingLocationMarkers.filter(
              (marker) => marker.id !== tempId,
            ),
          };
        }),
      // 세그먼트를 직접 누른 경우다. 도메인이 바뀌면 필터 항목 자체가 달라지므로 초기화한다.
      // 메뉴 이동은 이 함수를 쓰지 않는다 — `setActiveNav` 참조.
      setMode: (mode) =>
        set((state) =>
          state.mode === mode
            ? state
            : {
                mode,
                // 모드를 직접 바꾸면(마커관리 세그먼트 등) 지도 세그먼트도 따라간다.
                mapSegment: segmentOfMode(mode),
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
      moveStagedGroup: (id, coords) =>
        set((state) => ({
          pendingEquipmentMarkers: moveGroupedPendingMarkers(
            state.pendingEquipmentMarkers,
            state.stagedErpUpload?.reviewRows ?? [],
            id,
            coords,
          ),
        })),
      toggleFilterValue: (type, value) => {
        const filters = get().filters;
        const keyMap = {
          year: "selectedYears",
          business: "selectedBusinesses",
          status: "selectedStatuses",
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
          status: "selectedStatuses",
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
      // 위치등록 확인 대상은 수정 화면으로 저장하면 공정 정보가 빠지고 확인 절차도 건너뛴다.
      openEditModal: (id) =>
        set((state) =>
          isStagedReviewMarker(state.stagedErpUpload, id)
            ? state
            : {
                selectedMarkerId: id,
                selectedMarkerIds: id ? [id] : [],
                isEditOpen: true,
                isDetailOpen: false,
              },
        ),
      openRoadview: (lat, lng, name) =>
        set({
          roadviewPosition: { lat, lng, name },
          isRoadviewOpen: true,
        }),
      closeRoadview: () => set({ isRoadviewOpen: false, roadviewPosition: null }),
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
        mapSegment: state.mapSegment,
        lastDomainMode: state.lastDomainMode,
        isClusteringEnabled: state.isClusteringEnabled,
        clusterIconStyle: state.clusterIconStyle,
        isCadastralMode: state.isCadastralMode,
        isVworldParcelVisible: state.isVworldParcelVisible,
        savedWeatherSites: state.savedWeatherSites,
        scheduleSync: state.scheduleSync,
      }),
    },
  ),
);
