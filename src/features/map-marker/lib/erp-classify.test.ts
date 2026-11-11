import { describe, expect, it } from "vitest";
import type { ErpParsedRow } from "@/features/map-marker/lib/excel/data-manager/erp-parse";
import {
  classifyErpRows,
  isActiveFacilityYear,
  withFacilityYears,
  type ExistingMarkerRef,
} from "./erp-classify";

const NOW_YEAR = 2026;

const row = (facilityCode: string, facilityYear: string, address = "광주 북구 운암동 1"): ErpParsedRow => ({
  facilityCode,
  name: `국소 ${facilityCode}`,
  address,
  projectCode: "",
  facilityYear,
  businessType: "",
  eqClass: "",
  eqType: "",
  installDate: "",
  openDate: "",
  finalStationName: "",
  erp: {},
  raw: {},
});

const marker = (id: string, code: string, years: string[], withCoords = true): ExistingMarkerRef => ({
  id,
  facility_code: code,
  lat: withCoords ? 35.1 : null,
  lng: withCoords ? 126.9 : null,
  facility_years: years,
});

describe("isActiveFacilityYear", () => {
  it("올해와 미래는 진행 중, 지난 해와 빈 값은 아니다", () => {
    expect(isActiveFacilityYear("2026", NOW_YEAR)).toBe(true);
    expect(isActiveFacilityYear("2027", NOW_YEAR)).toBe(true);
    expect(isActiveFacilityYear("2025", NOW_YEAR)).toBe(false);
    expect(isActiveFacilityYear("", NOW_YEAR)).toBe(false);
    expect(isActiveFacilityYear("미정", NOW_YEAR)).toBe(false);
  });
});

describe("classifyErpRows — 사업연도", () => {
  it("DB에 없는 코드는 사업연도와 관계없이 새 마커(erp_코드)다", () => {
    const { classified } = classifyErpRows([row("A1", "2026")], [], NOW_YEAR);
    expect(classified.map((item) => [item.id, item.kind])).toEqual([["erp_A1", "new"]]);
  });

  it("올해 행은 같은 코드·같은 사업연도의 기존 마커에 연결한다(다시 올려도 중복 없음)", () => {
    const { classified } = classifyErpRows(
      [row("A1", "2026")],
      [marker("erp_A1", "A1", ["2026"])],
      NOW_YEAR,
    );
    expect(classified.map((item) => [item.id, item.kind])).toEqual([["erp_A1", "existing"]]);
  });

  it("같은 코드라도 사업연도가 올해 이상이고 기존 마커가 다른 연도면 새 마커로 만든다", () => {
    const { classified } = classifyErpRows(
      [row("A1", "2027")],
      [marker("erp_A1", "A1", ["2026"])],
      NOW_YEAR,
    );
    expect(classified.map((item) => [item.id, item.kind])).toEqual([["erp_A1_2027", "new"]]);
  });

  it("지난해 마커와 코드가 같아도 올해 행은 새 마커다", () => {
    const { classified } = classifyErpRows(
      [row("A1", "2026")],
      [marker("erp_A1", "A1", ["2024"])],
      NOW_YEAR,
    );
    expect(classified.map((item) => [item.id, item.kind])).toEqual([["erp_A1_2026", "new"]]);
  });

  it("그렇게 만든 새 마커도 다시 올리면 같은 ID의 기존 건으로 연결된다", () => {
    const existing = [marker("erp_A1", "A1", ["2026"]), marker("erp_A1_2027", "A1", ["2027"])];
    const { classified } = classifyErpRows([row("A1", "2026"), row("A1", "2027")], existing, NOW_YEAR);
    expect(classified.map((item) => [item.id, item.kind])).toEqual([
      ["erp_A1", "existing"],
      ["erp_A1_2027", "existing"],
    ]);
  });

  it("사업연도 정보가 없는 기존 마커는 올해 행과 연결한다(중복 방지)", () => {
    const { classified } = classifyErpRows([row("A1", "2026")], [marker("erp_A1", "A1", [])], NOW_YEAR);
    expect(classified.map((item) => item.kind)).toEqual(["existing"]);
  });

  it("지난 사업연도 행은 지난 연도의 기존 마커와 코드로 연결한다(예전 동작)", () => {
    const { classified } = classifyErpRows(
      [row("A1", "2024")],
      [marker("erp_A1", "A1", ["2024"], false)],
      NOW_YEAR,
    );
    expect(classified.map((item) => [item.id, item.kind])).toEqual([["erp_A1", "missingCoords"]]);
  });

  it("지난 사업연도 행은 진행 중인 같은 코드 마커를 덮어쓰지 않고 저장하지 않는다", () => {
    const { classified, skippedRows } = classifyErpRows(
      [row("A1", "2025")],
      [marker("erp_A1", "A1", ["2026"])],
      NOW_YEAR,
    );
    expect(classified).toEqual([]);
    expect(skippedRows).toEqual([{ name: "국소 A1", address: "광주 북구 운암동 1", reason: "지난 사업연도" }]);
  });

  it("사업연도가 빈 행은 예전처럼 코드로 연결한다", () => {
    const { classified } = classifyErpRows(
      [row("A1", "")],
      [marker("erp_A1", "A1", [])],
      NOW_YEAR,
    );
    expect(classified.map((item) => item.kind)).toEqual(["existing"]);
  });

  it("코드·주소가 없는 행은 사업연도와 관계없이 저장하지 않는다", () => {
    const { classified, skippedRows } = classifyErpRows(
      [row("", "2026"), row("B1", "2026", "불필요")],
      [],
      NOW_YEAR,
    );
    expect(classified).toEqual([]);
    expect(skippedRows.map((item) => item.reason)).toEqual(["코드 없음", "주소 없음"]);
  });

  it("같은 파일에 같은 코드·같은 연도가 두 번 나오면 두 번째는 _n 신규다", () => {
    const { classified } = classifyErpRows([row("A1", "2026"), row("A1", "2026")], [], NOW_YEAR);
    expect(classified.map((item) => item.id)).toEqual(["erp_A1", "erp_A1_1"]);
  });
});

describe("withFacilityYears", () => {
  it("마커마다 공정 정보의 시설연도를 모으고 빈 값은 건너뛴다", () => {
    const markers: ExistingMarkerRef[] = [
      { id: "m1", facility_code: "A", lat: 1, lng: 1 },
      { id: "m2", facility_code: "B", lat: 1, lng: 1 },
      { id: "m3", facility_code: "C", lat: 1, lng: 1 },
    ];
    const result = withFacilityYears(markers, [
      { marker_id: "m1", facility_year: "2026" },
      { marker_id: "m1", facility_year: " 2027 " },
      { marker_id: "m1", facility_year: "2026" },
      { marker_id: "m2", facility_year: null },
      { marker_id: "m2", facility_year: "" },
    ]);
    expect(result.map((marker) => marker.facility_years)).toEqual([["2026", "2027"], [], []]);
  });
});

const rowWithProject = (code: string, year: string, project: string, businessType = "부대장비증설"): ErpParsedRow => ({
  ...row(code, year),
  projectCode: project,
  businessType,
});

const markerWithProjects = (id: string, code: string, projects: string[]): ExistingMarkerRef => ({
  ...marker(id, code, ["2026"]),
  project_codes: projects,
});

describe("classifyErpRows — 같은 코드·같은 연도의 추가 사업", () => {
  it("프로젝트코드가 기존 마커와 다르면 같은 마커에 붙는 추가 건(addon)이다", () => {
    const { classified } = classifyErpRows(
      [rowWithProject("A1", "2026", "P-EXT")],
      [markerWithProjects("erp_A1", "A1", ["P-NEW"])],
      NOW_YEAR,
    );
    expect(classified.map((item) => [item.id, item.kind])).toEqual([["erp_A1", "addon"]]);
    expect(classified[0].lat).toBe(35.1);
  });

  it("프로젝트코드가 같으면 지금처럼 기존 건이다", () => {
    const { classified } = classifyErpRows(
      [rowWithProject("A1", "2026", "P-NEW")],
      [markerWithProjects("erp_A1", "A1", ["P-NEW"])],
      NOW_YEAR,
    );
    expect(classified.map((item) => item.kind)).toEqual(["existing"]);
  });

  it("기존 마커의 프로젝트코드를 모르거나 행의 프로젝트코드가 비면 추가 건으로 보지 않는다", () => {
    expect(
      classifyErpRows([rowWithProject("A1", "2026", "P-EXT")], [markerWithProjects("erp_A1", "A1", [])], NOW_YEAR)
        .classified.map((item) => item.kind),
    ).toEqual(["existing"]);
    expect(
      classifyErpRows([rowWithProject("A1", "2026", "")], [markerWithProjects("erp_A1", "A1", ["P-NEW"])], NOW_YEAR)
        .classified.map((item) => item.kind),
    ).toEqual(["existing"]);
  });

  it("같은 파일에 기존 사업 행과 추가 사업 행이 함께 있어도 새 마커를 만들지 않는다", () => {
    const { classified } = classifyErpRows(
      [rowWithProject("A1", "2026", "P-NEW"), rowWithProject("A1", "2026", "P-EXT")],
      [markerWithProjects("erp_A1", "A1", ["P-NEW"])],
      NOW_YEAR,
    );
    expect(classified.map((item) => [item.id, item.kind])).toEqual([
      ["erp_A1", "existing"],
      ["erp_A1", "addon"],
    ]);
  });

  it("추가 건도 좌표 없는 마커에 붙으면 addon이다(마커 위치 확인과 별개)", () => {
    const { classified } = classifyErpRows(
      [rowWithProject("A1", "2026", "P-EXT")],
      [{ ...markerWithProjects("erp_A1", "A1", ["P-NEW"]), lat: null, lng: null }],
      NOW_YEAR,
    );
    expect(classified.map((item) => item.kind)).toEqual(["addon"]);
  });
});

describe("withFacilityYears — 프로젝트코드", () => {
  it("마커마다 공정 정보의 프로젝트코드도 모은다", () => {
    const result = withFacilityYears(
      [{ id: "m1", facility_code: "A", lat: 1, lng: 1 }],
      [
        { marker_id: "m1", facility_year: "2026", project_code: " P1 " },
        { marker_id: "m1", facility_year: "2026", project_code: "P1" },
        { marker_id: "m1", facility_year: "2026", project_code: null },
      ],
    );
    expect(result[0].project_codes).toEqual(["P1"]);
  });
});
