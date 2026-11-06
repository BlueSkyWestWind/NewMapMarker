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
