import { describe, expect, it } from "vitest";
import type {
  BatteryMarker,
  EquipmentMarker,
} from "@/features/map-marker/types/marker";
import {
  batteryMarkerToCandidate,
  equipmentMarkerToCandidate,
  parseWorkType,
  searchSites,
  searchSitesMulti,
  type SiteCandidate,
} from "./site-search";

function battery(over: Partial<BatteryMarker> = {}): BatteryMarker {
  return {
    id: "b1",
    name: "조례국소",
    lat: 34.9506,
    lng: 127.4872,
    address: "전라남도 순천시 조례동 123-4",
    memo: "",
    tags: [],
    color: "#fff",
    facilityTeam: "",
    createdAt: "2026-07-26",
    items: [],
    capacity: 100,
    quantity: 1,
    stationName: "조례",
    ...over,
  };
}

function equipment(over: Partial<EquipmentMarker> = {}): EquipmentMarker {
  return {
    id: "e1",
    name: "월출국소",
    lat: 35.1595,
    lng: 126.8526,
    memo: "",
    tags: [],
    color: "#fff",
    facilityTeam: "",
    createdAt: "2026-07-26",
    roadAddress: "광주광역시 북구 월출로 12",
    jibunAddress: "광주광역시 북구 월출동 695-6",
    facilityCode: "",
    projectCode: "",
    facilityYear: "",
    businessType: "",
    finalStationName: "월출",
    eqClass: "",
    eqType: "",
    installDate: "",
    openDate: "",
    ...over,
  };
}

const asCandidates = (markers: BatteryMarker[]): SiteCandidate[] =>
  markers.map(batteryMarkerToCandidate);

describe("searchSites — 축전지 국소", () => {
  it("국소명 정확 일치가 최우선", () => {
    const list = asCandidates([battery({ id: "a", name: "조례국소2" }), battery({ id: "b" })]);
    expect(searchSites(list, "조례국소")[0].id).toBe("b");
  });

  it("별칭으로 찾는다", () => {
    const list = asCandidates([battery({ name: "SC-201", siteAlias: "조례, 순천조례" })]);
    const found = searchSites(list, "순천조례");

    expect(found).toHaveLength(1);
    expect(found[0].matchedBy).toBe("alias");
  });

  it("주소 부분일치로도 찾는다", () => {
    expect(searchSites(asCandidates([battery()]), "조례동 123")[0].matchedBy).toBe("address");
  });

  it("공백·하이픈 차이를 무시한다", () => {
    const list = asCandidates([battery({ name: "SC-조례" })]);
    expect(searchSites(list, "sc조례")).toHaveLength(1);
    expect(searchSites(list, "SC 조례")).toHaveLength(1);
  });

  it("좌표 없는 국소는 제외한다 — 기상 조회를 걸 수 없다", () => {
    const list = asCandidates([battery({ lat: Number.NaN, lng: Number.NaN })]);
    expect(searchSites(list, "조례")).toHaveLength(0);
  });

  it("일치하지 않으면 빈 배열", () => {
    expect(searchSites(asCandidates([battery()]), "여수")).toHaveLength(0);
  });

  it("빈 검색어는 빈 배열", () => {
    expect(searchSites(asCandidates([battery()]), "   ")).toHaveLength(0);
  });

  it("결과 개수를 제한한다", () => {
    const list = asCandidates(
      Array.from({ length: 20 }, (_, i) => battery({ id: `m${i}`, name: `조례국소${i}` })),
    );
    expect(searchSites(list, "조례", 5)).toHaveLength(5);
  });
});

describe("searchSites — 장비 국소", () => {
  it("장비 마커도 같은 방식으로 검색된다", () => {
    const list = [equipmentMarkerToCandidate(equipment())];
    const found = searchSites(list, "월출국소");

    expect(found).toHaveLength(1);
    expect(found[0].id).toBe("e1");
  });

  it("도로명 주소를 표시 주소로 쓴다", () => {
    const found = searchSites([equipmentMarkerToCandidate(equipment())], "월출");
    expect(found[0].address).toBe("광주광역시 북구 월출로 12");
  });

  it("도로명이 없으면 지번으로 떨어진다", () => {
    const candidate = equipmentMarkerToCandidate(equipment({ roadAddress: "" }));
    expect(candidate.address).toBe("광주광역시 북구 월출동 695-6");
  });

  it("최종국소명으로도 찾는다", () => {
    const list = [equipmentMarkerToCandidate(equipment({ name: "GJ-0012" }))];
    expect(searchSites(list, "월출")).toHaveLength(1);
  });

  it("장비 국소의 work_type도 반영된다", () => {
    const list = [equipmentMarkerToCandidate(equipment({ workType: "elevated" }))];
    expect(searchSites(list, "월출")[0].workType).toBe("elevated");
  });
});

describe("어댑터", () => {
  it("축전지 마커의 work_type을 전달한다", () => {
    const list = asCandidates([battery({ workType: "elevated" })]);
    expect(searchSites(list, "조례")[0].workType).toBe("elevated");
  });

  it("마이그레이션 미적용 DB(컬럼 없음)에서도 기본값으로 동작한다", () => {
    const candidate = batteryMarkerToCandidate(battery());
    expect(candidate.siteAlias).toBeNull();
    expect(candidate.workType).toBeNull();
    expect(searchSites([candidate], "조례")[0].workType).toBe("ground");
  });
});

describe("parseWorkType", () => {
  it("elevated만 고소로 보고 나머지는 지상으로 떨어뜨린다", () => {
    expect(parseWorkType("elevated")).toBe("elevated");
    expect(parseWorkType("ground")).toBe("ground");
    expect(parseWorkType(null)).toBe("ground");
    expect(parseWorkType("")).toBe("ground");
  });
});

describe("searchSitesMulti", () => {
  it("쉼표나 줄바꿈으로 구분된 여러 키워드를 다중 검색한다", () => {
    const list = asCandidates([
      battery({ id: "b1", name: "조례국소", stationName: "조례", address: "순천시 조례동 123" }),
      battery({ id: "b2", name: "순천국소", stationName: "순천", address: "순천시 서면 456" }),
      battery({ id: "b3", name: "여수국소", stationName: "여수", address: "여수시 학동 789" }),
    ]);
    const found = searchSitesMulti(list, "조례, 여수");
    expect(found).toHaveLength(2);
    expect(found.map((f) => f.id)).toEqual(["b1", "b3"]);
  });

  it("SUB 국소(parentMarkerId 존재 또는 groupRole=SUB)는 검색 결과에서 제외된다", () => {
    const candidate1 = equipmentMarkerToCandidate(equipment({ id: "e1", name: "월출대표", groupRole: "대표" }));
    const candidate2 = equipmentMarkerToCandidate(equipment({ id: "e2", name: "월출서브", groupRole: "SUB", parentMarkerId: "e1" }));
    const found = searchSites([candidate1, candidate2], "월출");
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe("e1");
  });

  it("번지가 연속으로 붙어 있는 주소문장을 다중 키워드로 파싱하여 검색한다", () => {
    const list = asCandidates([
      battery({ id: "b1", name: "수완국소", stationName: "수완", address: "광주광역시 광산구 수완동 1768번지" }),
      battery({ id: "b2", name: "오치국소", stationName: "오치", address: "광주광역시 북구 오치동 957-12번지" }),
    ]);
    const input = " 광주 광산구 수완동 1768번지 광주 북구 오치동 957-12번지 ";
    const found = searchSitesMulti(list, input);
    expect(found).toHaveLength(2);
    expect(found.map((f) => f.id)).toEqual(["b1", "b2"]);
  });

  it("시/구 이름만 같고 동/지번이 다른 불일치 국소는 과도하게 매칭되지 않는다", () => {
    const list = asCandidates([
      battery({ id: "target", name: "오치국소", address: "광주광역시 북구 오치동 957-12번지" }),
      battery({ id: "other1", name: "엠코코리아", address: "광주광역시 북구 대촌동 957번지" }),
      battery({ id: "other2", name: "양산우미", address: "광주광역시 북구 양산동 209-144번지" }),
    ]);
    const found = searchSites(list, "광주 북구 오치동 957-12번지");
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe("target");
  });
});
