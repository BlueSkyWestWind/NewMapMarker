import { describe, expect, it } from "vitest";
import { buildStationOptions, searchStations, type StationSource } from "./station-search";

function marker(
  id: string,
  name: string,
  extra: Partial<StationSource> = {},
): StationSource {
  return { id, name, finalStationName: "", roadAddress: "", jibunAddress: "", siteAlias: "", ...extra };
}

describe("buildStationOptions", () => {
  it("최종 국소명이 있으면 그것을, 없으면 이름을 라벨로 쓴다", () => {
    const options = buildStationOptions([
      marker("1", "표시이름", { finalStationName: "최종국소명" }),
      marker("2", "이름만"),
    ]);
    expect(options.map((option) => option.label)).toEqual(["최종국소명", "이름만"]);
  });

  it("같은 라벨은 하나만 남기고 빈 이름은 뺀다", () => {
    const options = buildStationOptions([
      marker("1", "중복"),
      marker("2", "중복"),
      marker("3", "   "),
    ]);
    expect(options.map((option) => option.label)).toEqual(["중복"]);
  });

  it("주소는 도로명을 먼저, 없으면 지번을 쓴다", () => {
    const [a, b] = buildStationOptions([
      marker("1", "가", { roadAddress: "도로명 1", jibunAddress: "지번 1" }),
      marker("2", "나", { jibunAddress: "지번 2" }),
    ]);
    expect(a.address).toBe("도로명 1");
    expect(b.address).toBe("지번 2");
  });
});

describe("searchStations", () => {
  const options = buildStationOptions([
    marker("1", "광주 쌍촌역"),
    marker("2", "쌍촌동 사거리"),
    marker("3", "수완 쌍촌 병원"),
    marker("4", "첨단파출소", { roadAddress: "광주 광산구 쌍촌로 1" }),
    marker("5", "엉뚱한곳", { siteAlias: "쌍촌별칭, 다른 이름" }),
    marker("6", "무관"),
  ]);

  it("검색어가 비어 있으면 아무것도 보여 주지 않는다", () => {
    expect(searchStations(options, "")).toEqual([]);
    expect(searchStations(options, "   ")).toEqual([]);
  });

  it("라벨이 검색어로 시작하는 것을 먼저, 포함하는 것을 그 다음, 주소·별칭 일치를 마지막에 준다", () => {
    expect(searchStations(options, "쌍촌").map((option) => option.label)).toEqual([
      "쌍촌동 사거리",
      "광주 쌍촌역",
      "수완 쌍촌 병원",
      "첨단파출소",
      "엉뚱한곳",
    ]);
  });

  it("공백과 대소문자를 무시한다", () => {
    const withLatin = buildStationOptions([marker("1", "GJ 중계기 A"), marker("2", "다른")]);
    expect(searchStations(withLatin, "gj").map((o) => o.label)).toEqual(["GJ 중계기 A"]);
    expect(searchStations(withLatin, "중계 기a").map((o) => o.label)).toEqual(["GJ 중계기 A"]);
  });

  it("최대 개수까지만 준다", () => {
    const many = buildStationOptions(
      Array.from({ length: 20 }, (_, i) => marker(String(i), `쌍촌${i}`)),
    );
    expect(searchStations(many, "쌍촌", 5)).toHaveLength(5);
    expect(searchStations(many, "쌍촌")).toHaveLength(8);
  });

  it("맞는 것이 없으면 빈 배열이다", () => {
    expect(searchStations(options, "없는이름")).toEqual([]);
  });
});

describe("통합시설코드·프로젝트코드 검색", () => {
  const coded = buildStationOptions([
    marker("1", "코드국소A", { facilityCode: "2026Y2670", projectCode: "L.C26A.55.0201" }),
    marker("2", "코드국소B", { facilityCode: "E.C26M.55.0087", projectCode: "" }),
    marker("3", "코드없음"),
  ]);

  it("후보에 통합시설코드와 프로젝트코드를 담는다(앞뒤 공백은 자른다)", () => {
    const [a, , c] = buildStationOptions([
      marker("1", "코드국소A", { facilityCode: " 2026Y2670 ", projectCode: "L.C26A.55.0201" }),
      marker("2", "x"),
      marker("3", "코드없음"),
    ]);
    expect(a.facilityCode).toBe("2026Y2670");
    expect(a.projectCode).toBe("L.C26A.55.0201");
    expect(c.facilityCode).toBe("");
    expect(c.projectCode).toBe("");
  });

  it("통합시설코드로 찾는다(대소문자·일부만 입력해도)", () => {
    expect(searchStations(coded, "2026Y2670").map((o) => o.label)).toEqual(["코드국소A"]);
    expect(searchStations(coded, "2026y26").map((o) => o.label)).toEqual(["코드국소A"]);
  });

  it("프로젝트코드로 찾는다(점·일부만 입력해도)", () => {
    expect(searchStations(coded, "L.C26A.55.0201").map((o) => o.label)).toEqual(["코드국소A"]);
    expect(searchStations(coded, "c26a.55").map((o) => o.label)).toEqual(["코드국소A"]);
    expect(searchStations(coded, "E.C26M").map((o) => o.label)).toEqual(["코드국소B"]);
  });

  it("공백이 섞여도 찾는다", () => {
    expect(searchStations(coded, " 2026 Y2670 ").map((o) => o.label)).toEqual(["코드국소A"]);
  });

  it("국소명 일치가 코드 일치보다, 코드 일치가 주소·별칭 일치보다 먼저 나온다", () => {
    const options = buildStationOptions([
      marker("a", "주소로만 맞음", { roadAddress: "광주 도로 2026" }),
      marker("b", "코드로 맞음", { facilityCode: "2026Y1" }),
      marker("c", "2026년 국소"),
    ]);
    expect(searchStations(options, "2026").map((o) => o.label)).toEqual([
      "2026년 국소",
      "코드로 맞음",
      "주소로만 맞음",
    ]);
  });

  it("코드가 없는 후보는 코드 검색에 걸리지 않는다", () => {
    expect(searchStations(coded, "없는코드")).toEqual([]);
  });
});
