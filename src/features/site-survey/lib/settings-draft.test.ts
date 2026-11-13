import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS as D } from "../constants/default-settings";
import type { SurveySettings } from "../types";
import {
  addAlias,
  countChanges,
  removeAlias,
  removeModeRule,
  setFieldEnabled,
  setAppendBeonji,
  setKnownModes,
  setModeUseMokukOnly,
  setNonScanLabel,
  setNotesOption,
  setRegionMap,
  setStationList,
  setStripS,
  updateAlias,
  upsertModeRule,
} from "./settings-draft";
import { validateSettings } from "./settings-schema";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
const frozen = (): SurveySettings => deepFreeze(structuredClone(D));

describe("순수 함수(입력을 바꾸지 않는다)", () => {
  it("얼린 입력으로 호출해도 새 객체를 돌려준다", () => {
    const base = frozen();
    expect(addAlias(base, "midCategory", { from: "a", to: "b" })).not.toBe(base);
    expect(setFieldEnabled(base, "notes", true)).not.toBe(base);
    expect(updateAlias(base, "sharer", 0, { from: "LGT", to: "X" })).not.toBe(base);
    expect(removeAlias(base, "sharer", 0)).not.toBe(base);
    expect(upsertModeRule(base, "터널", { field: "towerType", kind: "fixed", value: "터널" })).not.toBe(base);
    expect(removeModeRule(base, "인빌딩", "towerType")).not.toBe(base);
    expect(setModeUseMokukOnly(base, "터널", true)).not.toBe(base);
    expect(setStationList(base, "scanWords", ["a"])).not.toBe(base);
    expect(setKnownModes(base, ["a"])).not.toBe(base);
  });
});

describe("치환표", () => {
  it("추가하면 변경 1건이고 같은 원본을 또 넣으면 검증이 중복을 알린다", () => {
    const one = addAlias(D, "midCategory", { from: "새값", to: "바뀐값" });
    expect(countChanges(D, one)).toBe(1);
    const dup = addAlias(one, "midCategory", { from: "새값", to: "또" });
    expect(validateSettings(dup).join("\n")).toContain("중복");
  });

  it("수정·삭제가 된다", () => {
    const edited = updateAlias(D, "sharer", 0, { from: "LGT", to: "LG U+" });
    expect(edited.fields.sharer.aliases).toEqual([{ from: "LGT", to: "LG U+" }]);
    expect(removeAlias(D, "sharer", 0).fields.sharer.aliases).toEqual([]);
  });
});

describe("칸 켜짐", () => {
  it("켜면 변경 1건이고 되돌리면 0건이다", () => {
    const on = setFieldEnabled(D, "notes", true);
    expect(countChanges(D, on)).toBe(1);
    expect(countChanges(D, setFieldEnabled(on, "notes", false))).toBe(0);
  });
});

describe("방식별 예외", () => {
  it("새 모드를 만들고 같은 모드·같은 칸은 교체한다", () => {
    const a = upsertModeRule(D, "터널", { field: "towerType", kind: "fixed", value: "터널" });
    expect(a.modeRules.find((m) => m.mode === "터널")?.rules).toHaveLength(1);
    const b = upsertModeRule(a, "터널", { field: "towerType", kind: "fixed", value: "다른값" });
    const rules = b.modeRules.find((m) => m.mode === "터널")!.rules;
    expect(rules).toEqual([{ field: "towerType", kind: "fixed", value: "다른값" }]);
  });

  it("마지막 규칙을 지워도 useMokukOnly가 켜져 있으면 항목이 남는다", () => {
    let s = removeModeRule(D, "인빌딩", "towerType");
    s = removeModeRule(s, "인빌딩", "equipPlace");
    const set = s.modeRules.find((m) => m.mode === "인빌딩");
    expect(set).toEqual({ mode: "인빌딩", useMokukOnly: true, rules: [] });
  });

  it("규칙이 없고 useMokukOnly도 꺼지면 항목이 사라진다", () => {
    let s = removeModeRule(D, "인빌딩", "towerType");
    s = removeModeRule(s, "인빌딩", "equipPlace");
    s = setModeUseMokukOnly(s, "인빌딩", false);
    expect(s.modeRules.find((m) => m.mode === "인빌딩")).toBeUndefined();
  });

  it("setModeUseMokukOnly는 없는 방식에 항목을 만들고 끄면 지운다", () => {
    const on = setModeUseMokukOnly(D, "터널", true);
    expect(on.modeRules.find((m) => m.mode === "터널")).toEqual({ mode: "터널", useMokukOnly: true, rules: [] });
    expect(setModeUseMokukOnly(on, "터널", false).modeRules.find((m) => m.mode === "터널")).toBeUndefined();
  });
});

describe("국사·알려진 방식 목록", () => {
  it("목록을 바꾸면 변경 1건이다", () => {
    expect(countChanges(D, setStationList(D, "scanWords", ["통합국"]))).toBe(1);
    expect(countChanges(D, setKnownModes(D, [...D.knownModes, "신규"]))).toBe(1);
  });
});

describe("국사 표기·문제점 세부내역·주소·공중선", () => {
  it("비SCAN 표기를 바꾼다", () => {
    const s = setNonScanLabel(D, "NON-SCAN");
    expect(s.station.nonScanLabel).toBe("NON-SCAN");
    expect(countChanges(D, s)).toBe(1);
  });

  it("문제점 세부내역 옵션을 바꾼다", () => {
    const s = setNotesOption(setNotesOption(D, "includeAccess", false), "separator", " | ");
    expect(s.notes.includeAccess).toBe(false);
    expect(s.notes.separator).toBe(" | ");
    expect(countChanges(D, s)).toBe(2);
  });

  it("번지 붙이기·S 지우기·지역 매핑을 바꾼다", () => {
    expect(setAppendBeonji(D, false).address.appendBeonji).toBe(false);
    expect(setStripS(D, false).antenna.stripS).toBe(false);
    const s = setRegionMap(D, [{ prefix: "서울", region: "서울" }]);
    expect(s.address.regionMap).toEqual([{ prefix: "서울", region: "서울" }]);
    expect(countChanges(D, s)).toBe(1);
  });

  it("얼린 입력을 바꾸지 않는다", () => {
    const base = frozen();
    expect(setNonScanLabel(base, "x")).not.toBe(base);
    expect(setNotesOption(base, "includeEtc", false)).not.toBe(base);
    expect(setAppendBeonji(base, false)).not.toBe(base);
    expect(setStripS(base, false)).not.toBe(base);
    expect(setRegionMap(base, [])).not.toBe(base);
  });
});

describe("countChanges", () => {
  it("변경이 없으면 0이다", () => {
    expect(countChanges(D, structuredClone(D))).toBe(0);
  });

  it("여러 항목을 바꾸면 항목 수만큼 센다(배열은 한 항목)", () => {
    let s = setFieldEnabled(D, "notes", true);
    s = addAlias(s, "midCategory", { from: "a", to: "b" });
    s = setStationList(s, "scanWords", ["x"]);
    expect(countChanges(D, s)).toBe(3);
  });
});
