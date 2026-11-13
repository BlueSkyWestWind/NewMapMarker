import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../constants/default-settings";
import { cleanStationName, deriveStations, isScanStation } from "./station-rules";

const station = DEFAULT_SETTINGS.station;

describe("cleanStationName", () => {
  const cases: [string, string][] = [
    ["(공동)S여수봉산중심국_돌산L-DUF5-AC.55.LTE.DU20(내", "S여수봉산중심국"],
    ["S광주쌍암통합국-01_A-CDUH20(A12).55.5G.CDU20(내)(N", "S광주쌍암통합국"],
    ["S여수봉산중심국_1-DU30-1.55.LTE W.DU30(내)-WL", "S여수봉산중심국"],
    ["(도서)남면우학W.55.WCDMA.E3R-NODEB(외)", "남면우학W"],
    ["(공동)(도서)비금도L", "비금도L"],
    ["S제주전송실", "S제주전송실"],
    ["", ""],
    ["  S광주통합국 ", "S광주통합국"],
  ];
  it.each(cases)("%s → %s", (raw, expected) => {
    expect(cleanStationName(raw, station)).toBe(expected);
  });

  it("-##_ 는 숫자 두 자리만 맞는다", () => {
    expect(cleanStationName("S가나통합국-1_A", station)).toBe("S가나통합국-1");
  });
});

describe("isScanStation", () => {
  it("집중국·통합국·중심국·전송실이면 SCAN 국사다", () => {
    for (const name of ["S목포옥암통합국", "S광주쌍촌중심국", "S제주전송실", "광양집중국"]) {
      expect(isScanStation(name, station), name).toBe(true);
    }
  });
  it("기지국 이름은 SCAN이 아니다", () => {
    expect(isScanStation("남면우학W", station)).toBe(false);
    expect(isScanStation("돌산L", station)).toBe(false);
  });
});

describe("deriveStations", () => {
  const cases: { mokukName: string; upperName: string; useMokukOnly: boolean; mokuk: string; concentrator: string }[] = [
    { mokukName: "S광주쌍암통합국-01_A-CDUH20…", upperName: "", useMokukOnly: false, mokuk: "S광주쌍암통합국", concentrator: "S광주쌍암통합국" },
    {
      mokukName: "(공동)S광주쌍암중심국-26_DU30-2(E5).55.LTE W.DU30(",
      upperName: "(공동)S광주쌍암중심국-26_DU30-2(E5).55.LTE W.DU30(",
      useMokukOnly: false,
      mokuk: "S광주쌍암중심국",
      concentrator: "S광주쌍암중심국",
    },
    { mokukName: "(도서)남면우학W.55.WCDMA.E3R-NODEB(외)", upperName: "", useMokukOnly: false, mokuk: "남면우학W", concentrator: "비SCAN" },
    {
      mokukName: "S목포옥암통합국-16_B-CDUH10.55.5G.CDU10(내)",
      upperName: "S목포옥암중심국_남악신도시L-DUF30-C1.55.LTE.DU20(",
      useMokukOnly: true,
      mokuk: "S목포옥암통합국",
      concentrator: "S목포옥암통합국",
    },
    {
      mokukName: "S목포옥암통합국-16_B-CDUH10.55.5G.CDU10(내)",
      upperName: "S목포옥암중심국_남악신도시L-DUF30-C1.55.LTE.DU20(",
      useMokukOnly: false,
      mokuk: "S목포옥암중심국",
      concentrator: "S목포옥암통합국",
    },
    {
      mokukName: "(공동)S여수봉산중심국_돌산L-DUF5-AC.55.LTE.DU20(내",
      upperName: "(공동)S여수봉산중심국_돌산L-DUF5-AC.55.LTE.DU20(내",
      useMokukOnly: false,
      mokuk: "S여수봉산중심국",
      concentrator: "S여수봉산중심국",
    },
  ];
  it.each(cases)("$mokukName / useMokukOnly=$useMokukOnly", ({ mokukName, upperName, useMokukOnly, mokuk, concentrator }) => {
    expect(deriveStations({ mokukName, upperName, useMokukOnly }, station)).toEqual({ mokuk, concentrator });
  });

  it("scanWords에서 중심국을 빼면 중심국 모국의 집중국은 비SCAN이다", () => {
    const custom = { ...station, scanWords: ["집중국", "통합국", "전송실"] };
    const r = deriveStations({ mokukName: "S광주쌍암중심국_1-DU", upperName: "", useMokukOnly: false }, custom);
    expect(r.concentrator).toBe("비SCAN");
  });

  it("nonScanLabel을 바꾸면 그 값이 나온다", () => {
    const custom = { ...station, nonScanLabel: "NON-SCAN" };
    const r = deriveStations({ mokukName: "남면우학W", upperName: "", useMokukOnly: false }, custom);
    expect(r.concentrator).toBe("NON-SCAN");
  });

  it("모국명이 비어 있으면 집중국을 지어내지 않고 빈 값이다", () => {
    expect(deriveStations({ mokukName: "", upperName: "", useMokukOnly: false }, station)).toEqual({
      mokuk: "",
      concentrator: "",
    });
  });

  it("통합국과 중심국 이름이 달라도 반환값은 두 필드뿐이다(경고 정보 없음)", () => {
    const r = deriveStations(
      { mokukName: "S목포옥암통합국-16_B", upperName: "S목포옥암중심국_남악", useMokukOnly: false },
      station,
    );
    expect(Object.keys(r).sort()).toEqual(["concentrator", "mokuk"]);
  });
});
