import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS as D } from "../constants/default-settings";
import type { SurveySettings } from "../types";
import { diffSettings, mergeSettings, parseOverrides, SUPPORTED_SETTINGS_VERSION, validateSettings } from "./settings-schema";

const clone = (s: SurveySettings): SurveySettings => structuredClone(s);

describe("mergeSettings", () => {
  it("빈 덮어쓰기는 기본값과 같다", () => {
    expect(mergeSettings(D, {})).toEqual(D);
  });

  it("바뀐 칸의 치환표만 바뀌고 나머지는 기본값이다", () => {
    const merged = mergeSettings(D, { fields: { sharer: { aliases: [{ from: "KT", to: "KT+" }] } } });
    expect(merged.fields.sharer.aliases).toEqual([{ from: "KT", to: "KT+" }]);
    expect(merged.fields.sharer.enabled).toBe(D.fields.sharer.enabled);
    expect(merged.fields.midCategory).toEqual(D.fields.midCategory);
    expect(merged.station).toEqual(D.station);
  });

  it("배열은 합치지 않고 교체한다", () => {
    expect(mergeSettings(D, { station: { scanWords: ["통합국"] } }).station.scanWords).toEqual(["통합국"]);
  });

  it("기본값 객체를 바꾸지 않는다", () => {
    const before = JSON.stringify(D);
    mergeSettings(D, { station: { nonScanLabel: "X" } });
    expect(JSON.stringify(D)).toBe(before);
  });
});

describe("diffSettings", () => {
  it("같으면 빈 객체다", () => {
    expect(diffSettings(D, D)).toEqual({});
  });

  it("왕복해도 같다", () => {
    const x = clone(D);
    x.station.nonScanLabel = "NONSCAN";
    x.knownModes = [...x.knownModes, "신규"];
    x.fields.notes.enabled = true;
    x.fields.method.aliases = [...x.fields.method.aliases, { from: "인빌딩(광분산)", to: "광분산" }];
    expect(mergeSettings(D, diffSettings(D, x))).toEqual(x);
  });

  it("바뀐 부분만 담는다", () => {
    const x = clone(D);
    x.antenna.stripS = false;
    expect(diffSettings(D, x)).toEqual({ antenna: { stripS: false } });
  });
});

describe("parseOverrides", () => {
  it("알 수 없는 키는 무시하고 통과한다", () => {
    const r = parseOverrides({ version: 1, 알수없는키: 1, station: { scanWords: ["a"], 몰라: true } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.overrides).toEqual({ version: 1, station: { scanWords: ["a"] } });
  });

  it("형식이 틀리면 경로가 들어간 오류를 돌려준다", () => {
    const r = parseOverrides({ station: { scanWords: "문자열" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toContain("station.scanWords");
  });

  it("지원하지 않는 버전은 거부한다", () => {
    const r = parseOverrides({ version: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toContain("지원하지 않는 설정 버전");
    expect(SUPPORTED_SETTINGS_VERSION).toBe(1);
  });

  it("객체가 아니면 거부한다", () => {
    for (const v of [null, [], 3, "x"]) expect(parseOverrides(v).ok).toBe(false);
  });

  it("빈 객체는 통과한다", () => {
    expect(parseOverrides({})).toEqual({ ok: true, overrides: {} });
  });
});

describe("validateSettings", () => {
  it("기본 설정은 통과한다", () => {
    expect(validateSettings(D)).toEqual([]);
  });

  it("치환표 원본 중복·빈 원본을 거부한다", () => {
    const dup = clone(D);
    dup.fields.sharer.aliases = [
      { from: "A", to: "1" },
      { from: " A ", to: "2" },
    ];
    expect(validateSettings(dup).join("\n")).toContain("중복");
    const empty = clone(D);
    empty.fields.sharer.aliases = [{ from: "", to: "1" }];
    expect(validateSettings(empty).join("\n")).toContain("비어");
  });

  it("자르는 구분·SCAN 단어 목록이 비면 거부한다", () => {
    const a = clone(D);
    a.station.cutTokens = [];
    expect(validateSettings(a).join("\n")).toContain("자르는 구분");
    const b = clone(D);
    b.station.scanWords = [];
    expect(validateSettings(b).join("\n")).toContain("SCAN");
  });

  it("문제점 세부내역이 켜져 있으면 구분자가 비면 거부한다", () => {
    const x = clone(D);
    x.fields.notes.enabled = true;
    x.notes.separator = "";
    expect(validateSettings(x).join("\n")).toContain("구분자");
    x.fields.notes.enabled = false;
    expect(validateSettings(x)).toEqual([]);
  });

  it("방식 규칙의 모드 중복과 같은 모드 안의 칸 중복을 거부한다", () => {
    const x = clone(D);
    x.modeRules = [...x.modeRules, { mode: "인빌딩", useMokukOnly: false, rules: [] }];
    expect(validateSettings(x).join("\n")).toContain("방식");
    const y = clone(D);
    y.modeRules[0].rules = [
      { field: "towerType", kind: "fixed", value: "a" },
      { field: "towerType", kind: "fixed", value: "b" },
    ];
    expect(validateSettings(y).join("\n")).toContain("철탑 형태");
  });

  it("알려진 방식 목록의 중복과 빈 값을 거부한다", () => {
    const x = clone(D);
    x.knownModes = ["광분산", "광분산"];
    expect(validateSettings(x).join("\n")).toContain("알려진 방식");
    const y = clone(D);
    y.knownModes = ["", "광분산"];
    expect(validateSettings(y).join("\n")).toContain("알려진 방식");
  });
});
