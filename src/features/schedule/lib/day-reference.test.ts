import { describe, expect, it } from "vitest";

import {
  archiveValuesToRef,
  erpRowToRef,
  markerToRef,
  mergeRefTiers,
  toBizClass,
  toBizKind,
  toConstructionType,
  type ErpRefRow,
} from "@/features/schedule/lib/day-reference";
import type { DayValues } from "@/features/schedule/lib/day-types";

const EMPTY_ERP: ErpRefRow = {
  station_final: null,
  facility_code: null,
  project: null,
  method: null,
  biz_category: null,
  region_sigungu: null,
  equip_final: null,
  realty_type: null,
  equip_location: null,
  address_full: null,
  raw: null,
};

describe("toBizClass", () => {
  it("공정관리 방식을 사업분류 목록 값으로 바꾼다", () => {
    expect(toBizClass("광중계기")).toBe("중계기");
    expect(toBizClass("기지국")).toBe("기지국");
    expect(toBizClass("광분산")).toBe("인빌딩");
    expect(toBizClass("인빌딩")).toBe("인빌딩");
  });

  it("모르는 값은 앞뒤 공백만 지우고 그대로 돌려준다", () => {
    expect(toBizClass("  새방식 ")).toBe("새방식");
  });
});

describe("toBizKind", () => {
  it("5G·LTE·WCDMA는 그대로, Legacy는 WCDMA로 바꾼다", () => {
    expect(toBizKind("5G")).toBe("5G");
    expect(toBizKind("LTE")).toBe("LTE");
    expect(toBizKind("WCDMA")).toBe("WCDMA");
    expect(toBizKind("Legacy")).toBe("WCDMA");
  });

  it("-와 이동전화공통은 빈칸이 된다", () => {
    expect(toBizKind("-")).toBe("");
    expect(toBizKind("이동전화공통")).toBe("");
  });

  it("모르는 값은 원래 글 그대로, 앞뒤 공백만 지운다", () => {
    expect(toBizKind(" 새방식 ")).toBe("새방식");
  });
});

describe("toConstructionType", () => {
  it("부대장비증설은 증설로 바꾸고 나머지는 그대로 둔다", () => {
    expect(toConstructionType("부대장비증설")).toBe("증설");
    expect(toConstructionType("대개체")).toBe("대개체");
    expect(toConstructionType("신설")).toBe("신설");
    expect(toConstructionType("이설")).toBe("이설");
    expect(toConstructionType("철거")).toBe("철거");
  });

  it("모르는 값은 원래 글 그대로, 앞뒤 공백만 지운다", () => {
    expect(toConstructionType("새방식")).toBe("새방식");
    expect(toConstructionType("  새방식  ")).toBe("새방식");
  });
});

describe("erpRowToRef", () => {
  it("공정관리 한 행을 참조 값으로 바꾼다", () => {
    const ref = erpRowToRef({
      station_final: "강남역사",
      facility_code: "F-001",
      project: "PRJ-9",
      method: "광중계기",
      biz_category: "부대장비증설",
      region_sigungu: "강남구",
      equip_final: "RRU",
      realty_type: "건물",
      equip_location: "옥상",
      address_full: "서울 강남구 테헤란로 1",
      raw: { "세부사업 유형": "Legacy", "모국 (&기지국)": "서울모국" },
    });
    expect(ref).toEqual({
      facilityCode: "F-001",
      project: "PRJ-9",
      bizClass: "중계기",
      bizKind: "WCDMA",
      constructionType: "증설",
      region: "강남구",
      equipType: "RRU",
      motherStation: "서울모국",
      realtyType: "건물",
      equipLocation: "옥상",
      address: "서울 강남구 테헤란로 1",
    });
  });

  it("null과 빈 글은 키를 만들지 않는다", () => {
    expect(erpRowToRef(EMPTY_ERP)).toEqual({});
    expect(
      erpRowToRef({
        ...EMPTY_ERP,
        facility_code: "  ",
        method: "",
        raw: { "세부사업 유형": "-", "모국 (&기지국)": "" },
      }),
    ).toEqual({});
  });

  it("주소는 치환 없이 원본 그대로 둔다", () => {
    const address = "서울특별시 강남구  테헤란로 1 (역삼동)";
    expect(erpRowToRef({ ...EMPTY_ERP, address_full: address }).address).toBe(address);
  });

  it("raw의 사업유형이 이동전화공통이면 빈칸이라 키가 없다", () => {
    expect(erpRowToRef({ ...EMPTY_ERP, raw: { "세부사업 유형": "이동전화공통" } })).toEqual({});
  });
});

describe("archiveValuesToRef", () => {
  const VALUES: DayValues = {
    seq: "3",
    project: "누적프로젝트",
    facilityCode: "F-777",
    bizClass: "기지국",
    bizKind: "5G",
    constructionType: "신설",
    workCategory: "HW",
    region: "송파구",
    site: "잠실",
    equipType: "AAU",
    workDate: "2026-11-09",
    address: "서울 송파구 1",
    motherStation: "송파모국",
    worker: "홍길동",
    witness: "",
    signaler: "",
    realtyType: "옥상",
    equipLocation: "지상",
    levelLabel: "Level1",
    workTime: "주간",
    workType: "설치",
    equipment: "",
    workContent: "",
    workDetail: "",
  };

  it("참조 열만 담고 프로젝트는 넣지 않는다", () => {
    const ref = archiveValuesToRef(VALUES);
    expect(ref).toEqual({
      facilityCode: "F-777",
      bizClass: "기지국",
      bizKind: "5G",
      constructionType: "신설",
      region: "송파구",
      equipType: "AAU",
      address: "서울 송파구 1",
      motherStation: "송파모국",
      realtyType: "옥상",
      equipLocation: "지상",
    });
    expect("project" in ref).toBe(false);
  });

  it("빈 값은 키를 만들지 않는다", () => {
    expect(archiveValuesToRef({ ...VALUES, bizKind: "", address: "  ", realtyType: "" })).not.toHaveProperty("bizKind");
    expect(archiveValuesToRef({ ...VALUES, bizKind: "", address: "", realtyType: "" })).not.toHaveProperty("address");
    expect(archiveValuesToRef({ ...VALUES, bizKind: "", address: "", realtyType: "" })).not.toHaveProperty("realtyType");
  });
});

describe("markerToRef", () => {
  it("마커·정보 값을 참조 값으로 바꾼다", () => {
    expect(
      markerToRef({
        name: "강남역사",
        projectCode: "PRJ-1",
        facilityCode: "F-1",
        businessType: "부대장비증설",
        eqType: "RRU",
        roadAddress: "도로명 주소",
        jibunAddress: "지번 주소",
      }),
    ).toEqual({
      project: "PRJ-1",
      facilityCode: "F-1",
      constructionType: "증설",
      equipType: "RRU",
      address: "도로명 주소",
    });
  });

  it("도로명 주소가 없으면 지번 주소를 쓴다", () => {
    expect(markerToRef({ name: "A", roadAddress: "", jibunAddress: "지번 주소" }).address).toBe("지번 주소");
    expect(markerToRef({ name: "A", roadAddress: null, jibunAddress: "지번 주소" }).address).toBe("지번 주소");
  });

  it("값이 없으면 빈 객체", () => {
    expect(markerToRef({ name: "A" })).toEqual({});
  });
});

describe("mergeRefTiers", () => {
  it("값이 있는 첫 층을 통째로 쓰고 층 사이에 열을 섞지 않는다", () => {
    const merged = mergeRefTiers({
      erp: { facilityCode: "E-1" },
      archive: { facilityCode: "A-1", region: "송파구" },
      marker: { project: "PRJ", address: "주소" },
    });
    expect(merged).toEqual({ values: { facilityCode: "E-1" }, source: "erp" });
  });

  it("공정관리가 비면 누적, 누적이 비면 마커를 쓴다", () => {
    expect(mergeRefTiers({ erp: {}, archive: { region: "송파구" }, marker: { address: "주소" } })).toEqual({
      values: { region: "송파구" },
      source: "archive",
    });
    expect(mergeRefTiers({ archive: {}, marker: { address: "주소" } })).toEqual({
      values: { address: "주소" },
      source: "marker",
    });
  });

  it("모두 비면 빈 값과 null", () => {
    expect(mergeRefTiers({})).toEqual({ values: {}, source: null });
    expect(mergeRefTiers({ erp: {}, archive: {}, marker: {} })).toEqual({ values: {}, source: null });
  });
});
