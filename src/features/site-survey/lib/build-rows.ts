// 읽은 실사서(SurveyDoc) + 설정 + 선택한 칸 → 세부 시트 한 행(BuiltRow).
// 적용 순서(설계 §4.8.2): 원본 읽기 → 칸별 내장 변환 → 방식별 예외 → 치환표 → 꺼진 칸 제외.
// 파싱과 분리되어 있어 설정을 바꾸면 파일을 다시 읽지 않고 즉시 다시 계산한다.

import { DETAIL_COLUMNS } from "../constants/detail-columns";
import { FIELD_BY_ID, FIELD_RULES } from "../constants/survey-fields";
import type {
  BuiltRow,
  FieldId,
  FieldResult,
  FieldRule,
  RowWarning,
  SourceRef,
  SurveyDoc,
  SurveySettings,
} from "../types";
import { collectNoteParts } from "./notes";
import { deriveStations } from "./station-rules";
import {
  applyAliases,
  formatAddress,
  formatRound,
  joinParts,
  regionDetailOf,
  regionOf,
  siteNameOf,
  stripTrailingS,
} from "./transforms";

const isIdentity = (rule: FieldRule): boolean => rule.group === "identity";
const headerOf = (rule: FieldRule): string => DETAIL_COLUMNS[rule.column].header;

/** 설정의 기본 켜짐 칸(식별 칸은 항상) */
export function defaultEnabledFields(settings: SurveySettings): Set<FieldId> {
  return new Set(FIELD_RULES.filter((r) => isIdentity(r) || settings.fields[r.id].enabled).map((r) => r.id));
}

/** 사용자가 직접 바꾼 칸은 그 값, 나머지는 설정을 따른다. 식별 칸은 끌 수 없다 */
export function effectiveEnabled(settings: SurveySettings, touched: ReadonlyMap<FieldId, boolean>): Set<FieldId> {
  const set = defaultEnabledFields(settings);
  for (const [id, on] of touched) {
    if (isIdentity(FIELD_BY_ID[id])) continue;
    if (on) set.add(id);
    else set.delete(id);
  }
  return set;
}

/** 파일명 `프로젝트코드_통합시설코드_…`의 앞 두 조각 */
function codesFromFileName(fileName: string): { project: string; facilityCode: string } | null {
  const parts = fileName.split("_");
  return parts.length >= 2 ? { project: parts[0], facilityCode: parts[1] } : null;
}

export function buildRow(doc: SurveyDoc, settings: SurveySettings, enabled: ReadonlySet<FieldId>): BuiltRow {
  const warnings: RowWarning[] = [];
  const warn = (field: string, message: string) => warnings.push({ fileName: doc.fileName, field, message });

  const refOf = (rule: FieldRule, name: string): SourceRef => settings.fields[rule.id].sources[name] ?? rule.sources[name];

  /** 라벨을 못 찾으면 경고를 남기고 빈 값을 돌려준다 */
  const read = (rule: FieldRule, name: string): string => {
    const ref = refOf(rule, name);
    if (!doc.has(ref)) warn(headerOf(rule), `라벨을 찾지 못했습니다: ${ref.label}`);
    return doc.get(ref).trim();
  };

  // 방식 원본(치환 전): 방식별 예외와 국사 규칙의 조건이다. 방식 칸이 꺼져 있어도 읽는다
  const methodRule = FIELD_BY_ID.method;
  const methodRaw = doc.get(refOf(methodRule, "main")).trim();
  const modeSet = settings.modeRules.find((m) => m.mode === methodRaw);
  const useMokukOnly = modeSet?.useMokukOnly ?? false;

  const cells: Record<number, string> = {};
  const fields: FieldResult[] = [];

  for (const rule of FIELD_RULES) {
    if (!isIdentity(rule) && !enabled.has(rule.id)) continue;

    const raws: string[] = [];
    let value = "";
    switch (rule.transform) {
      case "copy": {
        const v = read(rule, "main");
        raws.push(v);
        value = v;
        break;
      }
      case "round": {
        const round = read(rule, "round");
        const year = read(rule, "year");
        raws.push(round);
        value = formatRound(round, year);
        break;
      }
      case "address": {
        const old = read(rule, "oldAddress");
        const lot = read(rule, "lot");
        raws.push(old, lot);
        value = formatAddress(old, lot, settings.address.appendBeonji);
        break;
      }
      case "antenna": {
        const v = read(rule, "main");
        raws.push(v);
        value = stripTrailingS(v, settings.antenna.stripS);
        break;
      }
      case "region": {
        const old = read(rule, "oldAddress");
        raws.push(old);
        value = regionOf(old, settings.address.regionMap);
        if (value === "" && old !== "") warn(headerOf(rule), `지역 구분을 만들 수 없습니다: ${old.split(/\s+/)[0]}`);
        break;
      }
      case "regionDetail": {
        const old = read(rule, "oldAddress");
        raws.push(old);
        value = regionDetailOf(old);
        break;
      }
      case "mokuk": {
        const mokukName = read(rule, "mokukName");
        const upperName = read(rule, "upperName");
        raws.push(mokukName, upperName);
        value = deriveStations({ mokukName, upperName, useMokukOnly }, settings.station).mokuk;
        break;
      }
      case "scan": {
        const mokukName = read(rule, "mokukName");
        raws.push(mokukName);
        value = deriveStations({ mokukName, upperName: "", useMokukOnly }, settings.station).concentrator;
        break;
      }
      case "siteName": {
        const name = read(rule, "facilityName");
        raws.push(name);
        value = siteNameOf(name);
        break;
      }
      case "notes": {
        value = joinParts(collectNoteParts(doc, settings.notes), settings.notes.separator);
        raws.push(value);
        break;
      }
    }

    let applied: FieldResult["applied"] = "";

    // 방식별 예외: 방식 원본과 같은 mode의 규칙
    const modeRule = modeSet?.rules.find((r) => r.field === rule.id);
    if (modeRule) {
      if (modeRule.kind === "fixed") {
        value = modeRule.value;
      } else {
        if (!doc.has(modeRule.source)) warn(headerOf(rule), `라벨을 찾지 못했습니다: ${modeRule.source.label}`);
        value = doc.get(modeRule.source).trim();
      }
      applied = "mode-rule";
    }

    // 치환표
    const replaced = applyAliases(value, settings.fields[rule.id].aliases);
    if (replaced !== value) {
      value = replaced;
      if (applied === "") applied = "alias";
    }

    // 방식 칸: 알려진 방식 목록 밖이면 경고(값은 그대로 내보낸다)
    if (rule.id === "method" && methodRaw !== "" && !settings.knownModes.includes(methodRaw)) {
      warn(headerOf(rule), `알 수 없는 방식 값: ${methodRaw}`);
    }

    cells[rule.column] = value;
    fields.push({ id: rule.id, column: rule.column, raw: joinParts(raws, " / "), value, applied });
  }

  // 파일명의 코드와 셀 값이 다르면 경고(셀 값을 쓴다)
  const fromName = codesFromFileName(doc.fileName);
  if (fromName) {
    const project = cells[FIELD_BY_ID.project.column];
    const code = cells[FIELD_BY_ID.facilityCode.column];
    if (project && fromName.project !== project) {
      warn("프로젝트", `파일명의 프로젝트 코드(${fromName.project})와 셀 값(${project})이 다릅니다`);
    }
    if (code && fromName.facilityCode !== code) {
      warn("통합시설코드", `파일명의 통합시설코드(${fromName.facilityCode})와 셀 값(${code})이 다릅니다`);
    }
  }

  return { fileName: doc.fileName, cells, fields, warnings };
}

/** 같은 통합시설코드가 둘 이상인 코드(한 번씩) */
export function duplicateFacilityCodes(rows: BuiltRow[]): string[] {
  const column = FIELD_BY_ID.facilityCode.column;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const code = row.cells[column];
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n > 1).map(([code]) => code);
}

export function summarizeRow(row: BuiltRow): { filledCount: number; warningCount: number } {
  const identity = new Set(FIELD_RULES.filter(isIdentity).map((r) => r.column));
  const filledCount = Object.entries(row.cells).filter(([col, v]) => !identity.has(Number(col)) && v !== "").length;
  return { filledCount, warningCount: row.warnings.length };
}
