import { describe, expect, it } from "vitest";
import type {
  EquipmentMarker,
  FacilityRecord,
} from "@/features/map-marker/types/marker";
import {
  computeFacilityStatuses,
  judgeFacilityStatus,
} from "./facility-status";

const rec = (year: string, installDate = "", openDate = ""): FacilityRecord => ({
  year,
  installDate,
  openDate,
});

function marker(
  id: string,
  facilityRecords: FacilityRecord[],
  overrides: Partial<EquipmentMarker> = {},
): EquipmentMarker {
  return {
    id,
    name: id,
    lat: 37.5,
    lng: 127,
    memo: "",
    tags: [],
    color: "#6366f1",
    facilityTeam: "",
    createdAt: "2026-01-01",
    roadAddress: "",
    jibunAddress: "",
    facilityCode: "",
    projectCode: "",
    facilityYear: "",
    businessType: "",
    finalStationName: "",
    eqClass: "",
    eqType: "",
    installDate: "",
    openDate: "",
    facilityRecords,
    ...overrides,
  };
}

const statusOf = (markers: EquipmentMarker[], id: string) =>
  computeFacilityStatuses(markers, 2026).find((m) => m.id === id)?.facilityStatus;

describe("judgeFacilityStatus", () => {
  it("장비가 없으면 올해 대상 없음", () => {
    expect(judgeFacilityStatus([])).toBe("올해 대상 없음");
  });

  it("시설일이 하나라도 없으면 미시설", () => {
    expect(
      judgeFacilityStatus([rec("2026", "2026-03-01", "2026-04-01"), rec("2026")]),
    ).toBe("미시설");
  });

  it("시설일 없이 개통일만 있는 예외 데이터는 미시설", () => {
    expect(judgeFacilityStatus([rec("2026", "", "2026-04-01")])).toBe("미시설");
  });

  it("미시설은 없고 개통일이 하나라도 없으면 시설", () => {
    expect(
      judgeFacilityStatus([
        rec("2026", "2026-03-01", "2026-04-01"),
        rec("2026", "2026-03-02"),
      ]),
    ).toBe("시설");
  });

  it("모두 시설·개통이면 개통완료", () => {
    expect(
      judgeFacilityStatus([rec("2026", "2026-03-01", "2026-04-01")]),
    ).toBe("개통완료");
  });

  it("공백뿐인 날짜는 빈 값으로 본다", () => {
    expect(judgeFacilityStatus([rec("2026", "  ", "")])).toBe("미시설");
  });
});

describe("computeFacilityStatuses", () => {
  it("올해 장비만 보고 지난해 장비는 판정에서 뺀다", () => {
    const markers = [
      marker("a", [rec("2025"), rec("2026", "2026-03-01", "2026-04-01")]),
    ];
    expect(statusOf(markers, "a")).toBe("개통완료");
  });

  it("올해 장비가 없으면 올해 대상 없음", () => {
    expect(statusOf([marker("a", [rec("2025", "2025-01-01", "2025-02-01")])], "a")).toBe(
      "올해 대상 없음",
    );
  });

  it("연도가 비어 있는 장비는 올해 대상이 아니다", () => {
    expect(statusOf([marker("a", [rec("")])], "a")).toBe("올해 대상 없음");
  });

  it("대표는 숨은 SUB의 올해 장비를 합쳐 판정한다", () => {
    const markers = [
      marker("rep", [rec("2026", "2026-03-01", "2026-04-01")]),
      marker("sub", [rec("2026")], { parentMarkerId: "rep" }),
    ];
    expect(statusOf(markers, "rep")).toBe("미시설");
  });

  it("개별 표시 SUB는 대표에 합산되지 않고 자기 장비로만 판정한다", () => {
    const markers = [
      marker("rep", [rec("2026", "2026-03-01", "2026-04-01")]),
      marker("sub", [rec("2026")], { parentMarkerId: "rep", detachedVisible: true }),
    ];
    expect(statusOf(markers, "rep")).toBe("개통완료");
    expect(statusOf(markers, "sub")).toBe("미시설");
  });

  it("그룹 연도는 자기와 숨은 SUB의 연도를 합친다", () => {
    const markers = [
      marker("rep", [rec("2025")]),
      marker("sub", [rec("2026")], { parentMarkerId: "rep" }),
    ];
    const rep = computeFacilityStatuses(markers, 2026).find((m) => m.id === "rep");
    expect(rep?.groupYears?.sort()).toEqual(["2025", "2026"]);
  });

  it("기준 연도를 바꾸면 그 해로 판정한다", () => {
    const markers = [marker("a", [rec("2025", "2025-01-01", "2025-02-01")])];
    const result = computeFacilityStatuses(markers, 2025);
    expect(result[0].facilityStatus).toBe("개통완료");
  });
});

describe("computeFacilityStatuses — 올해 이상(미래) 연도도 진행 대상이다", () => {
  it("올해는 개통완료여도 미래 연도 장비가 미시설이면 미시설이다", () => {
    const markers = [
      marker("a", [rec("2026", "2026-03-01", "2026-04-01"), rec("2027")]),
    ];
    expect(statusOf(markers, "a")).toBe("미시설");
  });

  it("미래 연도 장비만 있어도 올해 대상 없음이 아니라 그 장비로 판정한다", () => {
    expect(statusOf([marker("a", [rec("2027")])], "a")).toBe("미시설");
    expect(statusOf([marker("b", [rec("2027", "2027-03-01")])], "b")).toBe("시설");
    expect(
      statusOf([marker("c", [rec("2027", "2027-03-01", "2027-04-01")])], "c"),
    ).toBe("개통완료");
  });

  it("대표는 숨은 SUB의 미래 연도 장비까지 합쳐 판정한다", () => {
    const markers = [
      marker("rep", [rec("2026", "2026-03-01", "2026-04-01")]),
      marker("sub", [rec("2027")], { parentMarkerId: "rep" }),
    ];
    expect(statusOf(markers, "rep")).toBe("미시설");
  });

  it("지난 연도 장비는 여전히 판정에서 뺀다", () => {
    const markers = [marker("a", [rec("2025"), rec("2026", "2026-03-01", "2026-04-01")])];
    expect(statusOf(markers, "a")).toBe("개통완료");
    expect(statusOf([marker("b", [rec("2025")])], "b")).toBe("올해 대상 없음");
  });

  it("4자리 연도가 아닌 값은 진행 대상이 아니다", () => {
    expect(statusOf([marker("a", [rec("미정")])], "a")).toBe("올해 대상 없음");
  });
});
