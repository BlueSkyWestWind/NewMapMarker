import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ErpParsedRow } from "@/features/map-marker/lib/excel/data-manager/erp-parse";
import type {
  BatteryMarker,
  EquipmentMarker,
  StagedErpRow,
  StagedErpUpload,
} from "@/features/map-marker/types/marker";
import {
  appendFailCount,
  assertErpDateColumns,
  collectReviewTargets,
  emptyFilterSelection,
  partitionByCoords,
  summarizeStagedUpload,
  toBatteryDbMarker,
  toBatterySpecRows,
  toEquipmentDbInfo,
  toEquipmentDbMarker,
} from "./excel-upload-runners";

const NOW = "2026-11-14T00:00:00.000Z";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => vi.useRealTimers());

function erpRow(raw: Record<string, unknown>): ErpParsedRow {
  return { raw } as unknown as ErpParsedRow;
}

describe("assertErpDateColumns", () => {
  it("시설일·개통일 열이 모두 있으면 통과한다(값이 비어 있어도)", async () => {
    await expect(assertErpDateColumns([erpRow({ 시설일: "", 개통일: "" })])).resolves.toBeUndefined();
  });

  it("두 열이 모두 없으면 중단 오류를 던진다", async () => {
    await expect(assertErpDateColumns([erpRow({ 국소명: "A" })])).rejects.toThrow(
      "새 양식의 시설일·개통일 열을 찾지 못해 중단했습니다. 파일의 날짜 열을 확인하세요.",
    );
  });

  it("한 열만 없으면 그 열 이름만 알린다", async () => {
    await expect(assertErpDateColumns([erpRow({ 시설일: "x" })])).rejects.toThrow(
      "새 양식의 개통일 열을 찾지 못해",
    );
  });
});

describe("partitionByCoords", () => {
  it("좌표가 모두 있는 행과 지오코딩이 필요한 행으로 나눈다", () => {
    const rows = [
      { name: "a", lat: 37, lng: 127 },
      { name: "b", lat: 37 },
      { name: "c" },
      { name: "d", lng: 127 },
    ];
    const { withCoords, needGeocoding } = partitionByCoords(rows);
    expect(withCoords.map((row) => row.name)).toEqual(["a"]);
    expect(needGeocoding.map((row) => row.name)).toEqual(["b", "c", "d"]);
  });

  it("좌표가 0이어도 있는 것으로 본다", () => {
    const { withCoords } = partitionByCoords([{ lat: 0, lng: 0 }]);
    expect(withCoords).toHaveLength(1);
  });
});

describe("appendFailCount", () => {
  it("실패가 있으면 건수를 덧붙이고, 없으면 그대로 둔다", () => {
    expect(appendFailCount("완료", 2)).toBe("완료 (주소 찾기 실패: 2건)");
    expect(appendFailCount("완료", 0)).toBe("완료");
  });
});

describe("emptyFilterSelection", () => {
  it("선택이 모두 빈 필터를 매번 새 Set으로 만든다", () => {
    const a = emptyFilterSelection();
    const b = emptyFilterSelection();
    expect(Object.keys(a)).toHaveLength(8);
    expect(Object.values(a).every((set) => set instanceof Set && set.size === 0)).toBe(true);
    expect(a.selectedYears).not.toBe(b.selectedYears);
  });
});

const equipment = {
  id: "m1",
  name: "국소A",
  lat: 37.1,
  lng: 127.1,
  memo: "",
  tags: [],
  color: "#123456",
  facilityTeam: "1팀",
  createdAt: NOW,
  roadAddress: "도로명",
  jibunAddress: "지번",
  facilityCode: "FC1",
  projectCode: "P1",
  facilityYear: "2026",
  businessType: "신설",
  finalStationName: "최종",
  eqClass: "C",
  eqType: "T",
  installDate: "20260101",
  openDate: "20260201",
} as EquipmentMarker;

describe("toEquipmentDbMarker / toEquipmentDbInfo", () => {
  it("마커 행을 DB 컬럼 이름으로 바꾼다(시설코드가 비면 null)", () => {
    expect(toEquipmentDbMarker(equipment)).toEqual({
      id: "m1",
      name: "국소A",
      lat: 37.1,
      lng: 127.1,
      memo: "",
      tags: [],
      color: "#123456",
      facility_team: "1팀",
      facility_code: "FC1",
      road_address: "도로명",
      jibun_address: "지번",
      created_at: NOW,
    });
    expect(toEquipmentDbMarker({ ...equipment, facilityCode: "" }).facility_code).toBeNull();
  });

  it("색이 없으면 기본 색을 쓴다", () => {
    const row = toEquipmentDbMarker({ ...equipment, color: undefined as unknown as string });
    expect(typeof row.color).toBe("string");
    expect(row.color.length).toBeGreaterThan(0);
  });

  it("상세 정보 행은 날짜를 주어진 함수로 바꾼다", () => {
    const info = toEquipmentDbInfo(equipment, (value) => `Y:${value}`);
    expect(info).toMatchObject({
      marker_id: "m1",
      facility_code: "FC1",
      place_name: "국소A",
      install_date: "Y:20260101",
      open_date: "Y:20260201",
    });
  });
});

const battery = {
  id: "b1",
  name: "축전지국소",
  lat: 36.5,
  lng: 128.5,
  memo: "메모",
  tags: ["t"],
  color: "#abcdef",
  facilityTeam: "2팀",
  createdAt: NOW,
  address: "주소",
  items: [],
  capacity: 0,
  quantity: 0,
  stationName: "",
} as BatteryMarker;

describe("toBatteryDbMarker / toBatterySpecRows", () => {
  it("축전지 마커 행을 DB 컬럼으로 바꾼다", () => {
    expect(toBatteryDbMarker(battery)).toEqual({
      id: "b1",
      name: "축전지국소",
      lat: 36.5,
      lng: 128.5,
      address: "주소",
      memo: "메모",
      tags: ["t"],
      color: "#abcdef",
      facility_team: "2팀",
      created_at: NOW,
    });
  });

  it("색이 비면 저장 때 기본 색으로 바뀐다", () => {
    expect(toBatteryDbMarker({ ...battery, color: "" }).color).not.toBe("");
  });

  it("items가 비면 메모·이름·기본 용량 600·수량 12로 한 줄을 만든다", () => {
    expect(toBatterySpecRows({ ...battery, capacity: undefined as unknown as number, quantity: undefined as unknown as number })).toEqual([
      {
        marker_id: "b1",
        erp_name: "메모",
        capacity: 600,
        quantity: 12,
        station_name: "축전지국소",
        created_at: NOW,
      },
    ]);
  });

  it("items가 있으면 항목마다 한 줄이고 항목 값이 우선한다", () => {
    const rows = toBatterySpecRows({
      ...battery,
      items: [
        { erpName: "E1", capacity: 100, quantity: 2, stationName: "S1", createdAt: "2026-01-02T00:00:00.000Z" },
        { erpName: "", capacity: 0, quantity: 0, stationName: "", createdAt: "" },
      ] as BatteryMarker["items"],
      capacity: 300,
      quantity: 4,
      stationName: "ST",
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ erp_name: "E1", capacity: 100, quantity: 2, station_name: "S1", created_at: "2026-01-02T00:00:00.000Z" });
    expect(rows[1]).toMatchObject({ erp_name: "메모", capacity: 300, quantity: 4, station_name: "ST", created_at: NOW });
  });
});

function stagedRow(id: string, extra: Partial<StagedErpRow> = {}): StagedErpRow {
  return {
    id,
    kind: "new",
    name: id,
    address: "",
    lat: 37,
    lng: 127,
    marker: {},
    info: {},
    erp: {},
    ...extra,
  } as StagedErpRow;
}

describe("summarizeStagedUpload", () => {
  const base: StagedErpUpload = {
    reviewRows: [stagedRow("a"), stagedRow("b")],
    existingRows: [stagedRow("c")],
    skippedRows: [],
    needsRegroup: false,
    geocodeFailedAddresses: [],
  };

  it("확인 대기·기존 건수만 알린다", () => {
    expect(summarizeStagedUpload(base)).toBe("위치등록 파일을 불러왔습니다. 확인 대기 2건 · 기존 1건");
  });

  it("추가 사업과 저장 안 함 건수는 있을 때만 덧붙인다", () => {
    const text = summarizeStagedUpload({
      ...base,
      addonRows: [stagedRow("d")],
      skippedRows: [{ name: "x", address: "y", reason: "코드 없음" }],
    });
    expect(text).toBe(
      "위치등록 파일을 불러왔습니다. 확인 대기 2건 · 기존 1건 · 추가 사업 1건 · 저장 안 함 1건(코드·주소 없음)",
    );
  });
});

describe("collectReviewTargets", () => {
  const pending = [
    { id: "a", lat: 1, lng: 2 },
    { id: "b", lat: 3, lng: 4 },
  ];

  it("누른 행과 위치가 있는 묶음 구성원의 좌표를 모은다", () => {
    const rows = [stagedRow("a"), stagedRow("b")];
    const { targets, memberCount } = collectReviewTargets(rows, pending, "a");
    expect(memberCount).toBe(1);
    expect(targets).toEqual([{ row: rows[0], coords: { lat: 1, lng: 2 } }]);
  });

  it("묶음 구성원 중 위치가 없는 행이 있으면 targets가 memberCount보다 적다", () => {
    const rows = [
      stagedRow("a", { group: { key: "g", role: "대표" } }),
      stagedRow("b", { group: { key: "g", role: "SUB" } }),
    ];
    const { targets, memberCount } = collectReviewTargets(rows, [pending[0]], "a");
    expect(memberCount).toBe(2);
    expect(targets).toHaveLength(1);
  });
});
