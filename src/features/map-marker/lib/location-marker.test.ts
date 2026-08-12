import { describe, expect, it } from "vitest";
import {
  findEquipmentMarkerByAddress,
  findSavedMarkerByAddress,
  locationMarkerToSiteMatch,
  resolveWeatherSiteForLocation,
} from "./location-marker";
import type {
  BatteryMarker,
  EquipmentMarker,
  LocationMarker,
} from "@/features/map-marker/types/marker";

function equipment(overrides: Partial<EquipmentMarker> = {}): EquipmentMarker {
  return {
    id: "e1",
    name: "장비1",
    lat: 35.1,
    lng: 127.1,
    memo: "",
    tags: [],
    color: "#000",
    facilityTeam: "",
    createdAt: "",
    roadAddress: "광주 북구 월출동 695-6",
    jibunAddress: "광주 북구 월출동 695-6",
    facilityCode: "",
    projectCode: "",
    facilityYear: "",
    businessType: "",
    finalStationName: "",
    eqClass: "",
    eqType: "",
    installDate: "",
    openDate: "",
    ...overrides,
  };
}

function location(overrides: Partial<LocationMarker> = {}): LocationMarker {
  return {
    id: "loc_1",
    name: "위치1",
    lat: 35.2,
    lng: 127.2,
    memo: "",
    tags: [],
    color: "#000",
    facilityTeam: "",
    createdAt: "",
    address: "광주 북구 월출동 695-6",
    ...overrides,
  };
}

function battery(overrides: Partial<BatteryMarker> = {}): BatteryMarker {
  return {
    id: "b1",
    name: "축전지1",
    lat: 35.3,
    lng: 127.3,
    memo: "",
    tags: [],
    color: "#000",
    facilityTeam: "",
    createdAt: "",
    address: "여수시 돌산읍 우두리 1142-2",
    items: [],
    capacity: 0,
    quantity: 0,
    stationName: "",
    ...overrides,
  };
}

describe("locationMarkerToSiteMatch", () => {
  it("좌표·주소를 그대로 옮기고 작업유형은 지상 기본값을 쓴다", () => {
    const site = locationMarkerToSiteMatch(location());
    expect(site).toEqual({
      id: "loc_1",
      name: "위치1",
      address: "광주 북구 월출동 695-6",
      lat: 35.2,
      lng: 127.2,
      workType: "ground",
      matchedBy: "manual",
    });
  });
});

describe("findEquipmentMarkerByAddress", () => {
  it("공백·하이픈 차이를 무시하고 도로명주소가 같으면 찾는다", () => {
    const marker = equipment({ roadAddress: "광주 북구 월출동 695-6" });
    const result = findEquipmentMarkerByAddress(
      [marker],
      "광주북구 월출동 695-6",
    );
    expect(result?.id).toBe("e1");
  });

  it("지번주소로도 매칭한다", () => {
    const marker = equipment({ roadAddress: "", jibunAddress: "광주 북구 월출동 695-6" });
    const result = findEquipmentMarkerByAddress([marker], "광주 북구 월출동 695-6");
    expect(result?.id).toBe("e1");
  });

  it("주소가 다르면 못 찾는다", () => {
    const marker = equipment({
      roadAddress: "서울 중구 세종대로 110",
      jibunAddress: "서울 중구 태평로 1가",
    });
    const result = findEquipmentMarkerByAddress([marker], "광주 북구 월출동 695-6");
    expect(result).toBeNull();
  });

  it("SUB 국소는 대상에서 제외한다", () => {
    const marker = equipment({
      roadAddress: "광주 북구 월출동 695-6",
      parentMarkerId: "parent-1",
    });
    const result = findEquipmentMarkerByAddress([marker], "광주 북구 월출동 695-6");
    expect(result).toBeNull();
  });
});

describe("findSavedMarkerByAddress", () => {
  it("장비 마커 주소가 같으면 그 마커의 좌표를 쓴다", () => {
    const marker = equipment({
      id: "e1",
      lat: 35.1,
      lng: 127.1,
      roadAddress: "여수시 돌산읍 우두리 1142-2",
    });
    const result = findSavedMarkerByAddress(
      "여수시 돌산읍 우두리 1142-2",
      [marker],
      [],
    );
    expect(result).toEqual({ id: "e1", name: "장비1", lat: 35.1, lng: 127.1 });
  });

  it("장비에 없으면 축전지 마커에서 찾는다", () => {
    const marker = battery({
      id: "b1",
      lat: 35.3,
      lng: 127.3,
      address: "여수시 돌산읍 우두리 1142-2",
    });
    const result = findSavedMarkerByAddress(
      "여수시 돌산읍 우두리 1142-2",
      [],
      [marker],
    );
    expect(result).toEqual({ id: "b1", name: "축전지1", lat: 35.3, lng: 127.3 });
  });

  it("둘 다 없으면 null을 반환한다", () => {
    const result = findSavedMarkerByAddress("존재하지 않는 주소", [], []);
    expect(result).toBeNull();
  });
});

describe("resolveWeatherSiteForLocation", () => {
  it("주소가 같은 장비 마커가 있으면 그 장비 마커의 국소로 변환한다", () => {
    const marker = equipment({
      id: "e1",
      name: "장비1",
      lat: 35.1,
      lng: 127.1,
      roadAddress: "광주 북구 월출동 695-6",
      workType: "elevated",
    });
    const site = resolveWeatherSiteForLocation(location(), [marker]);
    expect(site).toEqual({
      id: "e1",
      name: "장비1",
      address: "광주 북구 월출동 695-6",
      lat: 35.1,
      lng: 127.1,
      workType: "elevated",
      matchedBy: "address",
    });
  });

  it("일치하는 장비 마커가 없으면 위치 마커 자신을 국소로 쓴다", () => {
    const site = resolveWeatherSiteForLocation(location(), []);
    expect(site.id).toBe("loc_1");
    expect(site.matchedBy).toBe("manual");
  });
});
