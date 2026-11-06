import { afterEach, describe, expect, it, vi } from "vitest";
import { UNSPECIFIED_FILTER_LABEL } from "@/features/map-marker/constants/facility-teams";
import type {
  EquipmentMarker,
  MarkerFilterState,
} from "@/features/map-marker/types/marker";
import {
  collectFilterOptions,
  createDefaultFilterState,
  hasAnyFilterSelection,
  markerPassesFilters,
  mergeFilterState,
  normalizeFilterValue,
  summarizeFilterSelection,
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

describe("연도 필터 기본값 (올해 + 미지정)", () => {
  type Options = ReturnType<typeof collectFilterOptions>;
  const options = (years: string[]): Options => ({
    years,
    businesses: ["신설", UNSPECIFIED_FILTER_LABEL],
    colors: ["#10b981"],
    tags: [UNSPECIFIED_FILTER_LABEL],
  });
  const JUNE_2026 = new Date(2026, 5, 1);

  afterEach(() => {
    vi.useRealTimers();
  });

  it("올해가 목록에 있으면 올해와 미지정만 선택한다", () => {
    const state = createDefaultFilterState(
      options(["2027", "2026", "2025", UNSPECIFIED_FILTER_LABEL]),
      JUNE_2026,
    );
    expect([...state.selectedYears].sort()).toEqual(["2026", UNSPECIFIED_FILTER_LABEL].sort());
  });

  it("미지정 연도가 목록에 없으면 올해만 선택한다", () => {
    const state = createDefaultFilterState(options(["2026", "2025"]), JUNE_2026);
    expect([...state.selectedYears]).toEqual(["2026"]);
  });

  it("올해 마커가 하나도 없으면 지도가 비지 않도록 전체를 선택한다", () => {
    const state = createDefaultFilterState(
      options(["2025", "2024", UNSPECIFIED_FILTER_LABEL]),
      JUNE_2026,
    );
    expect([...state.selectedYears].sort()).toEqual(
      ["2025", "2024", UNSPECIFIED_FILTER_LABEL].sort(),
    );
  });

  it("해가 바뀌면 코드 수정 없이 새 해를 기본으로 따라간다", () => {
    const years = ["2027", "2026", UNSPECIFIED_FILTER_LABEL];
    const in2027 = createDefaultFilterState(options(years), new Date(2027, 0, 2));
    expect([...in2027.selectedYears].sort()).toEqual(["2027", UNSPECIFIED_FILTER_LABEL].sort());
  });

  it("연도 목록이 비어 있으면(축전지·위치 모드 등) 기존처럼 비어 있다", () => {
    expect(createDefaultFilterState(options([]), JUNE_2026).selectedYears.size).toBe(0);
  });

  it("연도 외 차원(사업·색상·태그)은 전체 선택을 유지한다", () => {
    const state = createDefaultFilterState(options(["2026", "2025"]), JUNE_2026);
    expect([...state.selectedBusinesses].sort()).toEqual(["신설", UNSPECIFIED_FILTER_LABEL].sort());
    expect([...state.selectedColors]).toEqual(["#10b981"]);
    expect([...state.selectedTags]).toEqual([UNSPECIFIED_FILTER_LABEL]);
  });

  it("선택이 비어 있는 첫 병합에서도 같은 기본값이 적용된다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(JUNE_2026);
    const merged = mergeFilterState(emptyFilters(), options(["2026", "2025"]));
    expect([...merged.selectedYears]).toEqual(["2026"]);
  });

  it("사용자가 직접 고른 연도는 병합 후에도 그대로 유지한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(JUNE_2026);
    const current: MarkerFilterState = {
      ...emptyFilters(),
      selectedYears: new Set(["2025"]),
      selectedBusinesses: new Set(["신설"]),
    };
    const merged = mergeFilterState(current, options(["2026", "2025"]));
    expect([...merged.selectedYears]).toEqual(["2025"]);
  });
});

describe("summarizeFilterSelection", () => {
  const values = ["2027", "2026", "2025"];
  const sel = (...items: string[]) => new Set(items);

  it("이름 표시 한도가 없으면 기존 규칙: 모두 선택은 전체, 없으면 선택 안 함, 일부는 n/m", () => {
    expect(summarizeFilterSelection(values, sel(...values))).toBe("전체");
    expect(summarizeFilterSelection(values, sel())).toBe("선택 안 함");
    expect(summarizeFilterSelection(values, sel("2026"))).toBe("1/3 선택");
  });

  it("한도 안이면 선택된 값의 이름을 목록 순서대로 보여 준다", () => {
    expect(summarizeFilterSelection(values, sel("2026"), 3)).toBe("2026");
    expect(
      summarizeFilterSelection(["2026", UNSPECIFIED_FILTER_LABEL], sel(UNSPECIFIED_FILTER_LABEL, "2026"), 3),
    ).toBe(`2026, ${UNSPECIFIED_FILTER_LABEL}`);
  });

  it("값이 하나뿐이고 선택돼 있으면 전체가 아니라 그 이름을 보여 준다", () => {
    expect(summarizeFilterSelection(["2026"], sel("2026"), 3)).toBe("2026");
  });

  it("한도를 넘으면 기존 규칙으로 돌아간다", () => {
    const many = ["2027", "2026", "2025", "2024", "2023"];
    expect(summarizeFilterSelection(many, sel(...many), 3)).toBe("전체");
    expect(summarizeFilterSelection(many, sel("2027", "2026", "2025", "2024"), 3)).toBe("4/5 선택");
  });

  it("아무것도 선택하지 않으면 한도와 상관없이 선택 안 함", () => {
    expect(summarizeFilterSelection(values, sel(), 3)).toBe("선택 안 함");
  });
});
