// 환경설정 창의 편집 도우미. 모두 새 객체를 돌려주는 순수 함수라 화면(.tsx)이 아니라 여기서 테스트한다.

import type {
  Alias,
  FieldId,
  ModeRule,
  ModeRuleSet,
  NotesSettings,
  RegionRule,
  StationSettings,
  SurveySettings,
} from "../types";
import { diffSettings } from "./settings-schema";

/** 결과 표의 [치환 추가] 단축: 그 칸과 원본 값을 채운 채 설정 창을 연다 */
export type AliasShortcut = { fieldId: FieldId; from: string };

function edit(s: SurveySettings, fn: (draft: SurveySettings) => void): SurveySettings {
  const draft = structuredClone(s);
  fn(draft);
  return draft;
}

export function setFieldEnabled(s: SurveySettings, id: FieldId, enabled: boolean): SurveySettings {
  return edit(s, (d) => {
    d.fields[id].enabled = enabled;
  });
}

export function addAlias(s: SurveySettings, id: FieldId, alias: Alias): SurveySettings {
  return edit(s, (d) => {
    d.fields[id].aliases.push(alias);
  });
}

export function updateAlias(s: SurveySettings, id: FieldId, index: number, alias: Alias): SurveySettings {
  return edit(s, (d) => {
    d.fields[id].aliases[index] = alias;
  });
}

export function removeAlias(s: SurveySettings, id: FieldId, index: number): SurveySettings {
  return edit(s, (d) => {
    d.fields[id].aliases.splice(index, 1);
  });
}

/** 규칙도 없고 useMokukOnly도 꺼진 방식 항목은 지운다 */
function prune(d: SurveySettings, set: ModeRuleSet): void {
  if (set.rules.length === 0 && !set.useMokukOnly) d.modeRules = d.modeRules.filter((m) => m !== set);
}

function findOrCreate(d: SurveySettings, mode: string): ModeRuleSet {
  let set = d.modeRules.find((m) => m.mode === mode);
  if (!set) {
    set = { mode, useMokukOnly: false, rules: [] };
    d.modeRules.push(set);
  }
  return set;
}

export function upsertModeRule(s: SurveySettings, mode: string, rule: ModeRule): SurveySettings {
  return edit(s, (d) => {
    const set = findOrCreate(d, mode);
    const at = set.rules.findIndex((r) => r.field === rule.field);
    if (at >= 0) set.rules[at] = rule;
    else set.rules.push(rule);
  });
}

export function removeModeRule(s: SurveySettings, mode: string, field: FieldId): SurveySettings {
  return edit(s, (d) => {
    const set = d.modeRules.find((m) => m.mode === mode);
    if (!set) return;
    set.rules = set.rules.filter((r) => r.field !== field);
    prune(d, set);
  });
}

export function setModeUseMokukOnly(s: SurveySettings, mode: string, value: boolean): SurveySettings {
  return edit(s, (d) => {
    const set = findOrCreate(d, mode);
    set.useMokukOnly = value;
    prune(d, set);
  });
}

export function setStationList(
  s: SurveySettings,
  key: "stripTags" | "cutTokens" | "scanWords",
  list: string[],
): SurveySettings {
  return edit(s, (d) => {
    (d.station as StationSettings)[key] = [...list];
  });
}

export function setKnownModes(s: SurveySettings, list: string[]): SurveySettings {
  return edit(s, (d) => {
    d.knownModes = [...list];
  });
}

export function setNonScanLabel(s: SurveySettings, label: string): SurveySettings {
  return edit(s, (d) => {
    d.station.nonScanLabel = label;
  });
}

export function setNotesOption<K extends keyof NotesSettings>(
  s: SurveySettings,
  key: K,
  value: NotesSettings[K],
): SurveySettings {
  return edit(s, (d) => {
    d.notes[key] = value;
  });
}

export function setAppendBeonji(s: SurveySettings, value: boolean): SurveySettings {
  return edit(s, (d) => {
    d.address.appendBeonji = value;
  });
}

export function setRegionMap(s: SurveySettings, list: RegionRule[]): SurveySettings {
  return edit(s, (d) => {
    d.address.regionMap = list.map((r) => ({ ...r }));
  });
}

export function setStripS(s: SurveySettings, value: boolean): SurveySettings {
  return edit(s, (d) => {
    d.antenna.stripS = value;
  });
}

function countLeaves(value: unknown): number {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value).reduce<number>((sum, v) => sum + countLeaves(v), 0);
  }
  return 1; // 원시값과 배열은 한 항목
}

/** 기본 설정과 초안이 다른 항목 수(배열은 한 항목) */
export function countChanges(base: SurveySettings, draft: SurveySettings): number {
  const diff = diffSettings(base, draft);
  return Object.keys(diff).length === 0 ? 0 : countLeaves(diff);
}
