import { describe, expect, it } from "vitest";
import { UNSPECIFIED_FILTER_LABEL } from "@/features/map-marker/constants/facility-teams";
import type {
  EquipmentMarker,
  MarkerFilterState,
} from "@/features/map-marker/types/marker";
import {
  hasAnyFilterSelection,
  markerPassesFilters,
  normalizeFilterValue,
} from "./marker-filters";

function emptyFilters(): MarkerFilterState {
  return {
    selectedYears: new Set(),
    selectedBusinesses: new Set(),
    selectedColors: new Set(),
    selectedTags: new Set(),
    selectedCapacities: new Set(),
    selectedQuantities: new Set(),
    selectedStations: new Set(),
  };
}

function equipmentMarker(
  overrides: Partial<EquipmentMarker> = {},
): EquipmentMarker {
  return {
    id: "m1",
    name: "테스트국소",
    lat: 37.5,
    lng: 127.0,
    memo: "",
    tags: [],
    color: "#10b981",
    facilityTeam: "",
    createdAt: "2026-01-01",
    roadAddress: "",
    jibunAddress: "",
    facilityCode: "",
    projectCode: "",
    facilityYear: "2025",
    businessType: "신설",
    finalStationName: "",
    eqClass: "",
    eqType: "",
    installDate: "",
    openDate: "",
    ...overrides,
  };
}

describe("normalizeFilterValue", () => {
  it("빈 값은 미지정 라벨로", () => {
    expect(normalizeFilterValue("")).toBe(UNSPECIFIED_FILTER_LABEL);
    expect(normalizeFilterValue(null)).toBe(UNSPECIFIED_FILTER_LABEL);
    expect(normalizeFilterValue("  ")).toBe(UNSPECIFIED_FILTER_LABEL);
  });

  it("값은 트림해서 반환", () => {
    expect(normalizeFilterValue("  2025 ")).toBe("2025");
  });
});

describe("hasAnyFilterSelection", () => {
  it("선택이 없으면 false", () => {
    expect(hasAnyFilterSelection(emptyFilters())).toBe(false);
  });

  it("하나라도 선택되면 true", () => {
    const filters = emptyFilters();
    filters.selectedYears.add("2025");
    expect(hasAnyFilterSelection(filters)).toBe(true);
  });
});

describe("markerPassesFilters (equipment)", () => {
  it("필터가 비어 있으면 통과", () => {
    expect(
      markerPassesFilters(equipmentMarker(), "equipment", emptyFilters()),
    ).toBe(true);
  });

  it("연도 필터 일치 시 통과, 불일치 시 제외", () => {
    const pass = emptyFilters();
    pass.selectedYears.add("2025");
    expect(markerPassesFilters(equipmentMarker(), "equipment", pass)).toBe(true);

    const fail = emptyFilters();
    fail.selectedYears.add("2024");
    expect(markerPassesFilters(equipmentMarker(), "equipment", fail)).toBe(false);
  });

  it("사업 유형 필터 적용", () => {
    const filters = emptyFilters();
    filters.selectedBusinesses.add("증설");
    expect(markerPassesFilters(equipmentMarker(), "equipment", filters)).toBe(
      false,
    );
  });

  it("임시/대기 마커는 필터와 무관하게 통과", () => {
    const filters = emptyFilters();
    filters.selectedYears.add("2024");
    expect(
      markerPassesFilters(
        equipmentMarker({ isPending: true }),
        "equipment",
        filters,
      ),
    ).toBe(true);
  });

  it("태그 미지정 마커는 미지정 태그 필터에 매칭", () => {
    const filters = emptyFilters();
    filters.selectedTags.add(UNSPECIFIED_FILTER_LABEL);
    expect(
      markerPassesFilters(equipmentMarker({ tags: [] }), "equipment", filters),
    ).toBe(true);
  });
});
