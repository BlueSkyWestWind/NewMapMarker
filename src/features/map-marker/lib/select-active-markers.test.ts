import { describe, expect, it } from "vitest";
import { selectActiveMarkers } from "./select-active-markers";
import type { ActiveMarkerSources } from "./select-active-markers";
import type { MarkerRecord } from "@/features/map-marker/types/marker";

function marker(id: string, name = id): MarkerRecord {
  return {
    id,
    name,
    address: "",
    lat: 35,
    lng: 127,
  } as MarkerRecord;
}

function sources(overrides: Partial<ActiveMarkerSources> = {}): ActiveMarkerSources {
  return {
    equipmentMarkers: [],
    batteryMarkers: [],
    pendingEquipmentMarkers: [],
    pendingBatteryMarkers: [],
    pendingLocationMarkers: [],
    savedWeatherSiteIds: [],
    ...overrides,
  };
}

function ids(markers: MarkerRecord[]) {
  return markers.map((m) => m.id);
}

describe("selectActiveMarkers", () => {
  describe("장비 모드", () => {
    it("DB 장비 마커를 반환한다", () => {
      const result = selectActiveMarkers(
        "equipment",
        sources({ equipmentMarkers: [marker("e1"), marker("e2")] }),
      );
      expect(ids(result)).toEqual(["e1", "e2"]);
    });

    it("축전지 마커는 섞이지 않는다", () => {
      const result = selectActiveMarkers(
        "equipment",
        sources({
          equipmentMarkers: [marker("e1")],
          batteryMarkers: [marker("b1")],
        }),
      );
      expect(ids(result)).toEqual(["e1"]);
    });

    it("pending 마커를 뒤에 붙인다", () => {
      const result = selectActiveMarkers(
        "equipment",
        sources({
          equipmentMarkers: [marker("e1")],
          pendingEquipmentMarkers: [marker("p1")],
        }),
      );
      expect(ids(result)).toEqual(["e1", "p1"]);
    });

    it("같은 id가 겹치면 pending이 DB 값을 대체한다", () => {
      const result = selectActiveMarkers(
        "equipment",
        sources({
          equipmentMarkers: [marker("e1", "예전이름"), marker("e2")],
          pendingEquipmentMarkers: [marker("e1", "새이름")],
        }),
      );
      expect(ids(result)).toEqual(["e2", "e1"]);
      expect(result.find((m) => m.id === "e1")?.name).toBe("새이름");
    });

    it("DB 로드 전(null)이어도 pending은 보여 준다", () => {
      const result = selectActiveMarkers(
        "equipment",
        sources({
          equipmentMarkers: null,
          pendingEquipmentMarkers: [marker("p1")],
        }),
      );
      expect(ids(result)).toEqual(["p1"]);
    });
  });

  describe("축전지 모드", () => {
    it("DB 축전지 마커를 반환한다", () => {
      const result = selectActiveMarkers(
        "battery",
        sources({
          equipmentMarkers: [marker("e1")],
          batteryMarkers: [marker("b1")],
        }),
      );
      expect(ids(result)).toEqual(["b1"]);
    });

    it("축전지 pending을 붙이고 장비 pending은 무시한다", () => {
      const result = selectActiveMarkers(
        "battery",
        sources({
          batteryMarkers: [marker("b1")],
          pendingBatteryMarkers: [marker("pb1")],
          pendingEquipmentMarkers: [marker("pe1")],
        }),
      );
      expect(ids(result)).toEqual(["b1", "pb1"]);
    });
  });

  describe("위치 모드", () => {
    it("DB를 무시하고 임시 목록만 반환한다", () => {
      const result = selectActiveMarkers(
        "location",
        sources({
          equipmentMarkers: [marker("e1")],
          batteryMarkers: [marker("b1")],
          pendingLocationMarkers: [marker("l1")],
        }),
      );
      expect(ids(result)).toEqual(["l1"]);
    });
  });

  // 대시보드 규칙 (계획서 §3.4)
  describe("날씨 모드 = 대시보드", () => {
    it("작업등록이 0건이면 마커가 없다", () => {
      const result = selectActiveMarkers(
        "weather",
        sources({
          equipmentMarkers: [marker("e1")],
          batteryMarkers: [marker("b1")],
          savedWeatherSiteIds: [],
        }),
      );
      expect(result).toEqual([]);
    });

    it("작업등록한 장비 국소만 올린다", () => {
      const result = selectActiveMarkers(
        "weather",
        sources({
          equipmentMarkers: [marker("e1"), marker("e2"), marker("e3")],
          savedWeatherSiteIds: ["e1", "e3"],
        }),
      );
      expect(ids(result)).toEqual(["e1", "e3"]);
    });

    it("등록되지 않은 일반 마커는 감춘다", () => {
      const result = selectActiveMarkers(
        "weather",
        sources({
          equipmentMarkers: [marker("e1"), marker("e2")],
          savedWeatherSiteIds: ["e1"],
        }),
      );
      expect(ids(result)).toEqual(["e1"]);
    });

    // 사용자 확정: 대시보드에서는 축전지 마커를 볼 필요 없다.
    // 그래서 지도 마커 수 ≤ 목록 건수이고, 둘은 같지 않을 수 있다.
    it("축전지 국소는 저장돼 있어도 지도에 올리지 않는다", () => {
      const result = selectActiveMarkers(
        "weather",
        sources({
          equipmentMarkers: [marker("e1")],
          batteryMarkers: [marker("b1")],
          savedWeatherSiteIds: ["e1", "b1"],
        }),
      );
      expect(ids(result)).toEqual(["e1"]);
    });

    it("임시 위치 마커도 올리지 않는다", () => {
      const result = selectActiveMarkers(
        "weather",
        sources({
          pendingLocationMarkers: [marker("l1")],
          savedWeatherSiteIds: ["l1"],
        }),
      );
      expect(result).toEqual([]);
    });

    it("DB 로드 전이면 빈 목록을 준다", () => {
      const result = selectActiveMarkers(
        "weather",
        sources({ equipmentMarkers: null, savedWeatherSiteIds: ["e1"] }),
      );
      expect(result).toEqual([]);
    });
  });

  it("입력 배열을 변형하지 않는다", () => {
    const equipmentMarkers = [marker("e1")];
    const pendingEquipmentMarkers = [marker("p1")];
    selectActiveMarkers(
      "equipment",
      sources({ equipmentMarkers, pendingEquipmentMarkers }),
    );
    expect(ids(equipmentMarkers)).toEqual(["e1"]);
    expect(ids(pendingEquipmentMarkers)).toEqual(["p1"]);
  });
});
