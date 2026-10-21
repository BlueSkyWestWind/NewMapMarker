import { describe, expect, it } from "vitest";
import { getLotAddressKey } from "@/features/map-marker/lib/address-group";
import type { EquipmentMarker } from "@/features/map-marker/types/marker";
import {
  BASEMENT_LABEL,
  ETC_DONG_LABEL,
  buildEquipmentDetailRows,
  dbErrorMessage,
  dongSortKey,
  getAddressGroupMates,
  getMarkerDongLabel,
  getMarkerEffectiveKey,
  parseSeparationLabel,
  pickDongMapRepresentative,
  pickNextAddressRepresentative,
  storedGroupRoleOf,
  takeInfoRowForMarker,
  toInfoRowFromEquipment,
  type InfoRow,
} from "./marker-detail-rows";

/** 테스트에 필요한 필드만 채운 장비 마커. */
function marker(overrides: Partial<EquipmentMarker> & { id: string }): EquipmentMarker {
  return {
    name: "",
    lat: 0,
    lng: 0,
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
    ...overrides,
  } as EquipmentMarker;
}

describe("parseSeparationLabel / dongSortKey / getMarkerDongLabel", () => {
  it("동 번호를 '121동' 꼴로 뽑는다", () => {
    expect(parseSeparationLabel("광주 121동옥상")).toBe("121동");
    expect(parseSeparationLabel("3 동 기지국")).toBe("3동");
  });

  it("지하·B1 표기는 지하 라벨", () => {
    expect(parseSeparationLabel("A지하주차장")).toBe(BASEMENT_LABEL);
    expect(parseSeparationLabel("B1층")).toBe(BASEMENT_LABEL);
  });

  it("동과 지하가 같이 있으면 동이 우선", () => {
    expect(parseSeparationLabel("3동 지하")).toBe("3동");
  });

  it("라벨이 없거나 빈 값이면 null", () => {
    expect(parseSeparationLabel("일반국소")).toBeNull();
    expect(parseSeparationLabel("")).toBeNull();
    expect(parseSeparationLabel(null)).toBeNull();
    expect(parseSeparationLabel(undefined)).toBeNull();
  });

  it("정렬 키: 동 < 지하 < 기타", () => {
    const labels = [ETC_DONG_LABEL, BASEMENT_LABEL, "10동", "2동"];
    expect([...labels].sort((a, b) => dongSortKey(a) - dongSortKey(b))).toEqual([
      "2동",
      "10동",
      BASEMENT_LABEL,
      ETC_DONG_LABEL,
    ]);
  });

  it("마커의 동 라벨: 최종 국소명을 우선하고, 없으면 기타", () => {
    expect(getMarkerDongLabel(marker({ id: "a", finalStationName: "지하1", name: "3동" }))).toBe(
      BASEMENT_LABEL,
    );
    expect(getMarkerDongLabel(marker({ id: "a", name: "101동 옥상" }))).toBe("101동");
    expect(getMarkerDongLabel(marker({ id: "a", name: "무명" }))).toBe(ETC_DONG_LABEL);
  });
});

describe("그룹 키와 대표 선택", () => {
  it("분리 그룹 키가 있으면 번지보다 우선(앞뒤 공백 제거)", () => {
    const m = marker({ id: "a", groupKey: " g1 ", roadAddress: "광주 북구 1" });
    expect(getMarkerEffectiveKey(m)).toBe("g1");
  });

  it("그룹 키가 없으면 도로명·지번 순으로 번지 키", () => {
    expect(getMarkerEffectiveKey(marker({ id: "a", roadAddress: "광주 북구 첨단로 1" }))).toBe(
      getLotAddressKey("광주 북구 첨단로 1"),
    );
    expect(getMarkerEffectiveKey(marker({ id: "a", jibunAddress: "광주 북구 두암동 3" }))).toBe(
      getLotAddressKey("광주 북구 두암동 3"),
    );
    expect(getMarkerEffectiveKey(marker({ id: "a" }))).toBe("");
  });

  it("같은 그룹 국소 목록: 키가 없으면 자기 자신만, 있으면 같은 키 전부", () => {
    const a = marker({ id: "a", groupKey: "g" });
    const b = marker({ id: "b", groupKey: "g" });
    const c = marker({ id: "c", groupKey: "other" });
    expect(getAddressGroupMates(a, [a, b, c]).map((m) => m.id)).toEqual(["a", "b"]);

    const lone = marker({ id: "x" });
    expect(getAddressGroupMates(lone, [lone, a]).map((m) => m.id)).toEqual(["x"]);
  });

  it("동 대표: 개별 표시 중인 국소가 있으면 그중 이름순 첫째", () => {
    const a = marker({ id: "a", name: "가" });
    const b = marker({ id: "b", name: "나", detachedVisible: true });
    const c = marker({ id: "c", name: "다", detachedVisible: true });
    expect(pickDongMapRepresentative([a, c, b])?.id).toBe("b");
  });

  it("동 대표: 개별 표시가 없으면 전체 중 이름순, 이름이 같으면 id순", () => {
    const a = marker({ id: "z", name: "가" });
    const b = marker({ id: "y", name: "가" });
    expect(pickDongMapRepresentative([a, b])?.id).toBe("y");
    expect(pickDongMapRepresentative([])).toBeNull();
  });

  it("다음 대표 후보: 최종 국소명이 있으면 그것으로 정렬", () => {
    const a = marker({ id: "a", name: "가", finalStationName: "다" });
    const b = marker({ id: "b", name: "나", finalStationName: "나" });
    expect(pickNextAddressRepresentative([a, b])?.id).toBe("b");
    expect(pickNextAddressRepresentative([])).toBeNull();
  });

  it("저장된 구분: 값이 있으면 정규화, 부모가 있으면 SUB, 아니면 대표", () => {
    expect(storedGroupRoleOf(marker({ id: "a", groupRole: "서브" }))).toBe("SUB");
    expect(storedGroupRoleOf(marker({ id: "a", groupRole: "단독" }))).toBe("단독");
    expect(storedGroupRoleOf(marker({ id: "a", parentMarkerId: "p" }))).toBe("SUB");
    expect(storedGroupRoleOf(marker({ id: "a" }))).toBe("대표");
  });
});

describe("상세 표 행 만들기", () => {
  it("장비 마커에서 information 모양 행을 만든다", () => {
    const row = toInfoRowFromEquipment(
      marker({ id: "m1", name: "국소A", facilityCode: "F-1", facilityYear: "2024" }),
    );
    expect(row).toMatchObject({
      marker_id: "m1",
      group_role: "대표",
      facility_code: "F-1",
      facility_year: "2024",
      final_station_name: "국소A",
    });
  });

  it("행 매칭: id와 이름이 모두 맞는 행을 먼저 꺼내고 pool에서 제거한다", () => {
    const m = marker({ id: "m1", name: "국소A" });
    const other: InfoRow = { marker_id: "m1", final_station_name: "다른이름" };
    const exact: InfoRow = { marker_id: "m1", final_station_name: "국소A" };
    const pool = [other, exact];

    expect(takeInfoRowForMarker(m, pool)).toBe(exact);
    expect(pool).toEqual([other]);
  });

  it("행 매칭: id가 같은 행이 하나뿐이면 이름이 달라도 그 행", () => {
    const m = marker({ id: "m1", name: "국소A" });
    const only: InfoRow = { marker_id: "m1", final_station_name: "다른이름" };
    expect(takeInfoRowForMarker(m, [only])).toBe(only);
  });

  it("행 매칭: 맞는 행이 없으면 null", () => {
    expect(takeInfoRowForMarker(marker({ id: "m1", name: "A" }), [])).toBeNull();
  });

  it("국소가 없으면 빈 배열", () => {
    expect(buildEquipmentDetailRows([], [])).toEqual([]);
  });

  it("단독 국소: information이 없으면 마커로 1행, 있으면 그 행들을 그대로(구분·마커id 보강)", () => {
    const m = marker({ id: "m1", name: "국소A" });
    expect(buildEquipmentDetailRows([m], [])).toHaveLength(1);

    const rows = buildEquipmentDetailRows(
      [m],
      [{ facility_code: "F-1" }, { facility_code: "F-2", marker_id: "zzz" }],
    );
    expect(rows.map((r) => r.facility_code)).toEqual(["F-1", "F-2"]);
    expect(rows.map((r) => r.marker_id)).toEqual(["m1", "zzz"]);
    expect(rows.every((r) => r.group_role === "대표")).toBe(true);
  });

  it("그룹: 국소 1건당 1행만 만들고 남은 information은 붙이지 않는다", () => {
    const a = marker({ id: "a", name: "101동" });
    const b = marker({ id: "b", name: "102동", parentMarkerId: "a" });
    const info: InfoRow[] = [
      { marker_id: "a", final_station_name: "101동", facility_code: "FA" },
      { marker_id: "b", final_station_name: "102동", facility_code: "FB" },
      { marker_id: "c", final_station_name: "103동", facility_code: "FC" },
    ];

    const rows = buildEquipmentDetailRows([a, b], info);
    expect(rows.map((r) => r.facility_code)).toEqual(["FA", "FB"]);
    expect(rows.map((r) => r.group_role)).toEqual(["대표", "SUB"]);
  });
});

describe("dbErrorMessage", () => {
  it("detached_visible 컬럼이 없다는 오류는 마이그레이션 안내", () => {
    expect(dbErrorMessage({ message: "column detached_visible does not exist" }, "저장 실패")).toContain(
      "20260722000000_add_detached_visible.sql",
    );
    expect(dbErrorMessage({ code: "PGRST204" }, "저장 실패")).toContain("detached_visible");
    expect(dbErrorMessage({ code: "42703" }, "저장 실패")).toContain("detached_visible");
  });

  it("그 외 오류는 fallback에 상세를 덧붙인다", () => {
    expect(dbErrorMessage({ message: "boom" }, "저장 실패")).toBe("저장 실패 (boom)");
    expect(dbErrorMessage({}, "저장 실패")).toBe("저장 실패");
    expect(dbErrorMessage(null, "저장 실패")).toBe("저장 실패");
  });
});
