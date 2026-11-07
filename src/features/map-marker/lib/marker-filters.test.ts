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
    selectedStatuses: new Set(),
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
    statuses: ["미시설", "시설", "개통완료", "올해 대상 없음"],
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

  it("올해 마커가 하나도 없어도 전체로 되돌리지 않는다", () => {
    const state = createDefaultFilterState(
      options(["2025", "2024", UNSPECIFIED_FILTER_LABEL]),
      JUNE_2026,
    );
    expect([...state.selectedYears]).toEqual([UNSPECIFIED_FILTER_LABEL]);
  });

  it("올해도 미지정도 없으면 빈 집합(걸러내지 않음)이다", () => {
    const state = createDefaultFilterState(options(["2025", "2024"]), JUNE_2026);
    expect(state.selectedYears.size).toBe(0);
  });

  it("해가 바뀌면 코드 수정 없이 새 해를 기본으로 따라간다", () => {
    const years = ["2027", "2026", UNSPECIFIED_FILTER_LABEL];
    const in2027 = createDefaultFilterState(options(years), new Date(2027, 0, 2));
    expect([...in2027.selectedYears].sort()).toEqual(["2027", UNSPECIFIED_FILTER_LABEL].sort());
  });

  it("연도 목록이 비어 있으면(축전지·위치 모드 등) 기존처럼 비어 있다", () => {
    expect(createDefaultFilterState(options([]), JUNE_2026).selectedYears.size).toBe(0);
  });

  it("상태 필터의 기본은 미시설·시설이다", () => {
    const state = createDefaultFilterState(options(["2026"]), JUNE_2026);
    expect([...state.selectedStatuses]).toEqual(["미시설", "시설"]);
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

  it("사용자가 특정 필터를 전체 해제(빈 집합)하면 병합 후에도 다시 전체 선택으로 덮어쓰지 않는다", () => {
    const current: MarkerFilterState = {
      ...emptyFilters(),
      selectedYears: new Set(["2026"]),
      selectedBusinesses: new Set(), // 전체 해제 상태
      selectedStatuses: new Set(["미시설"]),
      selectedColors: new Set(["#10b981"]),
      selectedTags: new Set(), // 전체 해제 상태
    };
    const opts = options(["2026", "2025"]);
    const merged = mergeFilterState(current, opts, opts);
    expect(merged.selectedBusinesses.size).toBe(0);
    expect(merged.selectedTags.size).toBe(0);
    expect([...merged.selectedYears]).toEqual(["2026"]);
  });

  it("초기화 이후 모든 필터를 전체 해제해도 기본값으로 되돌리지 않는다", () => {
    const opts = options(["2026", "2025"]);
    const merged = mergeFilterState(emptyFilters(), opts, opts);
    expect(merged.selectedYears.size).toBe(0);
    expect(merged.selectedBusinesses.size).toBe(0);
    expect(merged.selectedStatuses.size).toBe(0);
    expect(merged.selectedColors.size).toBe(0);
    expect(merged.selectedTags.size).toBe(0);
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

describe("상태 필터와 그룹 연도 필터", () => {
  it("상태 필터를 고르면 그 상태의 마커만 통과한다", () => {
    const filters = emptyFilters();
    filters.selectedStatuses.add("미시설");
    expect(
      markerPassesFilters(equipmentMarker({ facilityStatus: "미시설" }), "equipment", filters),
    ).toBe(true);
    expect(
      markerPassesFilters(equipmentMarker({ facilityStatus: "개통완료" }), "equipment", filters),
    ).toBe(false);
  });

  it("상태 정보가 없는 마커는 올해 대상 없음으로 본다", () => {
    const filters = emptyFilters();
    filters.selectedStatuses.add("올해 대상 없음");
    expect(markerPassesFilters(equipmentMarker(), "equipment", filters)).toBe(true);
  });

  it("상태 필터가 비어 있으면 걸러내지 않는다", () => {
    expect(
      markerPassesFilters(
        equipmentMarker({ facilityStatus: "개통완료" }),
        "equipment",
        emptyFilters(),
      ),
    ).toBe(true);
  });

  it("대표가 2025년이어도 그룹에 2026년 장비가 있으면 2026 필터를 통과한다", () => {
    const filters = emptyFilters();
    filters.selectedYears.add("2026");
    const marker = equipmentMarker({ facilityYear: "2025", groupYears: ["2025", "2026"] });
    expect(markerPassesFilters(marker, "equipment", filters)).toBe(true);
  });

  it("그룹 연도가 선택과 겹치지 않으면 탈락한다", () => {
    const filters = emptyFilters();
    filters.selectedYears.add("2026");
    const marker = equipmentMarker({ groupYears: ["2024", "2025"] });
    expect(markerPassesFilters(marker, "equipment", filters)).toBe(false);
  });

  it("그룹 연도가 비어 있으면 미지정으로 본다", () => {
    const filters = emptyFilters();
    filters.selectedYears.add(UNSPECIFIED_FILTER_LABEL);
    expect(
      markerPassesFilters(equipmentMarker({ groupYears: [] }), "equipment", filters),
    ).toBe(true);
  });

  it("옵션은 상태를 고정 순서로, 마커에 있는 것만 모은다", () => {
    const options = collectFilterOptions(
      [
        equipmentMarker({ id: "a", facilityStatus: "개통완료" }),
        equipmentMarker({ id: "b", facilityStatus: "미시설" }),
      ],
      "equipment",
    );
    expect(options.statuses).toEqual(["미시설", "개통완료"]);
  });

  it("상태는 표시색 기준 색상 옵션에도 반영된다", () => {
    const options = collectFilterOptions(
      [equipmentMarker({ facilityStatus: "개통완료", color: "#6366f1" })],
      "equipment",
    );
    expect(options.colors).toEqual(["#ffffff"]);
  });
});
