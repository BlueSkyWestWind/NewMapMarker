import { beforeEach, describe, expect, it, vi } from "vitest";

// 스토어의 persist가 import 시점에 저장소를 잡는다. Node에는 쓸 수 있는 localStorage가 없다.
vi.hoisted(() => {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    },
  });
});

import { useMapMarkerStore } from "./use-map-marker-store";
import type { LocationMarker } from "@/features/map-marker/types/marker";
import type { SiteMatch } from "@/features/worksite-weather/types/weather";

const temp = (id: string) => ({ id, name: id, lat: 35, lng: 127 }) as LocationMarker;
const site = (id: string, tempMarkerId?: string) =>
  ({ id, name: id, address: "", lat: 35, lng: 127, workType: "ground", matchedBy: "manual", tempMarkerId }) as SiteMatch;
const tempIds = () => useMapMarkerStore.getState().pendingLocationMarkers.map((m) => m.id);

describe("작업 국소를 제거하면 임시 마커도 제거한다", () => {
  beforeEach(() => {
    useMapMarkerStore.setState({
      pendingLocationMarkers: [temp("loc_1"), temp("loc_2"), temp("loc_3")],
      savedWeatherSites: [site("loc_1"), site("eq_1", "loc_2"), site("loc_3")],
    });
  });

  it("임시 마커 자체가 국소인 경우", () => {
    useMapMarkerStore.getState().removeSavedWeatherSite("loc_1");
    expect(tempIds()).toEqual(["loc_2", "loc_3"]);
  });

  it("장비 마커로 연결된 국소는 원래 임시 마커를 지운다", () => {
    useMapMarkerStore.getState().removeSavedWeatherSite("eq_1");
    expect(tempIds()).toEqual(["loc_1", "loc_3"]);
    expect(useMapMarkerStore.getState().savedWeatherSites.map((s) => s.id)).toEqual(["loc_1", "loc_3"]);
  });

  it("전체 비우기는 작업 국소의 임시 마커를 모두 지운다", () => {
    useMapMarkerStore.getState().clearSavedWeatherSites();
    expect(tempIds()).toEqual([]);
  });
});

describe("국소 목록 선택", () => {
  it("켜고 끈다", () => {
    useMapMarkerStore.setState({ selectedSiteListIds: [] });
    useMapMarkerStore.getState().toggleSiteList("a");
    useMapMarkerStore.getState().toggleSiteList("b");
    useMapMarkerStore.getState().toggleSiteList("a");
    expect(useMapMarkerStore.getState().selectedSiteListIds).toEqual(["b"]);
  });
});

describe("그룹관리 메뉴 상태", () => {
  it("그룹관리 세그먼트는 위치 모드를 쓴다", () => {
    useMapMarkerStore.setState({ mode: "equipment", activeNav: "markers", mapSegment: "equipment" });
    useMapMarkerStore.getState().setMapSegment("groups");
    expect(useMapMarkerStore.getState().mode).toBe("location");
  });

  it("묶음 키를 켜고 끈다", () => {
    useMapMarkerStore.setState({ selectedGroupKeys: [] });
    useMapMarkerStore.getState().toggleGroupKey("a");
    useMapMarkerStore.getState().toggleGroupKey("b");
    useMapMarkerStore.getState().toggleGroupKey("a");
    expect(useMapMarkerStore.getState().selectedGroupKeys).toEqual(["b"]);
    useMapMarkerStore.getState().setGroupKeys(["x", "y"]);
    expect(useMapMarkerStore.getState().selectedGroupKeys).toEqual(["x", "y"]);
  });

  it("전체 화면 관리 키와 마지막 키를 둔다", () => {
    useMapMarkerStore.getState().setGroupManageKey("k1");
    useMapMarkerStore.getState().setLastGroupManageKey("k1");
    useMapMarkerStore.getState().setGroupManageKey(null);
    const state = useMapMarkerStore.getState();
    expect(state.groupManageKey).toBeNull();
    expect(state.lastGroupManageKey).toBe("k1");
  });
});

describe("로드뷰를 닫아도 열어 둔 마커창은 남는다", () => {
  beforeEach(() => {
    useMapMarkerStore.setState({
      selectedMarkerId: "a",
      selectedMarkerIds: ["a", "b", "c"],
    });
    useMapMarkerStore.getState().openRoadview(35, 127, "국소");
  });

  it("closeRoadview는 로드뷰만 닫고 마커 선택은 그대로 둔다", () => {
    useMapMarkerStore.getState().closeRoadview();
    const state = useMapMarkerStore.getState();
    expect(state.isRoadviewOpen).toBe(false);
    expect(state.roadviewPosition).toBeNull();
    expect(state.selectedMarkerIds).toEqual(["a", "b", "c"]);
    expect(state.selectedMarkerId).toBe("a");
  });
});

describe("마커창 선택은 메뉴마다 독립이다", () => {
  beforeEach(() => {
    useMapMarkerStore.setState({
      activeNav: "dashboard",
      mode: "weather",
      selectedMarkerId: "c",
      selectedMarkerIds: ["a", "b", "c"],
      selectionByNav: {},
    });
  });

  it("대시보드가 펼친 마커창은 지도 메뉴로 따라가지 않는다", () => {
    useMapMarkerStore.getState().setActiveNav("map");
    const state = useMapMarkerStore.getState();
    expect(state.selectedMarkerIds).toEqual([]);
    expect(state.selectedMarkerId).toBeNull();
  });

  it("대시보드로 돌아오면 대시보드의 선택이 복원된다", () => {
    useMapMarkerStore.getState().setActiveNav("map");
    useMapMarkerStore.getState().setSelectedMarkerIds(["x"]);
    useMapMarkerStore.getState().setActiveNav("dashboard");
    expect(useMapMarkerStore.getState().selectedMarkerIds).toEqual(["a", "b", "c"]);
    useMapMarkerStore.getState().setActiveNav("map");
    expect(useMapMarkerStore.getState().selectedMarkerIds).toEqual(["x"]);
  });

  it("같은 메뉴를 다시 눌러도 선택은 그대로다", () => {
    useMapMarkerStore.getState().setActiveNav("dashboard");
    expect(useMapMarkerStore.getState().selectedMarkerIds).toEqual(["a", "b", "c"]);
  });
});

describe("메뉴를 옮기면 지도 보기 토글은 되돌아온다", () => {
  it("마커 숨김은 다른 메뉴에 가면 다시 보이고, 같은 메뉴 재클릭은 유지한다", () => {
    useMapMarkerStore.setState({ activeNav: "map", isMarkersVisible: false });
    useMapMarkerStore.getState().setActiveNav("map");
    expect(useMapMarkerStore.getState().isMarkersVisible).toBe(false);
    useMapMarkerStore.getState().setActiveNav("dashboard");
    expect(useMapMarkerStore.getState().isMarkersVisible).toBe(true);
  });
});

describe("지도와 무관한 메뉴는 이전 마커를 숨기고 시작한다", () => {
  it.each(["schedule", "barcode", "backup", "settings", "accounts"] as const)("%s", (nav) => {
    useMapMarkerStore.setState({ activeNav: "dashboard", isMarkersVisible: true });
    useMapMarkerStore.getState().setActiveNav(nav);
    expect(useMapMarkerStore.getState().isMarkersVisible).toBe(false);
  });

  it.each(["map", "markers", "dashboard"] as const)("%s는 마커를 보인다", (nav) => {
    useMapMarkerStore.setState({ activeNav: "settings", isMarkersVisible: false });
    useMapMarkerStore.getState().setActiveNav(nav);
    expect(useMapMarkerStore.getState().isMarkersVisible).toBe(true);
  });
});
