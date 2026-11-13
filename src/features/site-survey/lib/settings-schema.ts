// 환경설정: 스키마(zod) 검증, 기본값과 합치기, 기본값과 다른 부분 뽑기, 저장 전 검사.
// 저장하는 것은 "기본값과 다른 부분만"이라 코드의 기본값을 고쳐도 건드리지 않은 항목은 따라간다.

import { z } from "zod";
import { DETAIL_COLUMNS } from "../constants/detail-columns";
import { FIELD_BY_ID, FIELD_RULES } from "../constants/survey-fields";
import type { FieldId, SurveySettings, SurveySettingsOverrides } from "../types";

export const SUPPORTED_SETTINGS_VERSION = 1;

const sourceRef = z.object({
  section: z.number().int(),
  label: z.string(),
  direction: z.enum(["below", "right"]),
  nth: z.number().int().optional(),
});
const alias = z.object({ from: z.string(), to: z.string() });
const fieldSetting = z.object({
  enabled: z.boolean().optional(),
  aliases: z.array(alias).optional(),
  sources: z.record(sourceRef).optional(),
});
const FIELD_IDS = FIELD_RULES.map((r) => r.id) as [FieldId, ...FieldId[]];
const modeRule = z.discriminatedUnion("kind", [
  z.object({ field: z.enum(FIELD_IDS), kind: z.literal("fixed"), value: z.string() }),
  z.object({ field: z.enum(FIELD_IDS), kind: z.literal("source"), source: sourceRef }),
]);

// 알 수 없는 키는 zod 기본 동작(strip)으로 버린다
const overridesSchema = z.object({
  version: z.literal(1).optional(),
  fields: z.object(Object.fromEntries(FIELD_IDS.map((id) => [id, fieldSetting.optional()]))).optional(),
  modeRules: z.array(z.object({ mode: z.string(), useMokukOnly: z.boolean(), rules: z.array(modeRule) })).optional(),
  knownModes: z.array(z.string()).optional(),
  station: z
    .object({
      stripTags: z.array(z.string()).optional(),
      cutTokens: z.array(z.string()).optional(),
      scanWords: z.array(z.string()).optional(),
      nonScanLabel: z.string().optional(),
    })
    .optional(),
  notes: z
    .object({
      includeEtc: z.boolean().optional(),
      includeAccess: z.boolean().optional(),
      includeBuilding: z.boolean().optional(),
      separator: z.string().optional(),
    })
    .optional(),
  address: z
    .object({
      appendBeonji: z.boolean().optional(),
      regionMap: z.array(z.object({ prefix: z.string(), region: z.string() })).optional(),
    })
    .optional(),
  antenna: z.object({ stripS: z.boolean().optional() }).optional(),
});

export function parseOverrides(
  json: unknown,
): { ok: true; overrides: SurveySettingsOverrides } | { ok: false; errors: string[] } {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, errors: ["설정은 객체여야 합니다"] };
  }
  const version = (json as { version?: unknown }).version;
  if (version !== undefined && version !== SUPPORTED_SETTINGS_VERSION) {
    return { ok: false, errors: [`지원하지 않는 설정 버전입니다: ${String(version)}`] };
  }
  const parsed = overridesSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(최상위)"}: ${i.message}`),
    };
  }
  return { ok: true, overrides: parsed.data as SurveySettingsOverrides };
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function mergeDeep(base: unknown, over: unknown): unknown {
  if (over === undefined) return structuredClone(base);
  if (isPlain(base) && isPlain(over)) {
    const out: Record<string, unknown> = structuredClone(base);
    for (const key of Object.keys(over)) out[key] = mergeDeep(base[key], over[key]);
    return out;
  }
  return structuredClone(over);
}

/** 객체는 재귀로 합치고 배열·원시값은 교체한다. 기본값 객체는 바꾸지 않는다 */
export function mergeSettings(defaults: SurveySettings, overrides: SurveySettingsOverrides): SurveySettings {
  return mergeDeep(defaults, overrides) as SurveySettings;
}

function diffDeep(base: unknown, cur: unknown): unknown {
  if (isPlain(base) && isPlain(cur)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(cur)) {
      const d = diffDeep(base[key], cur[key]);
      if (d !== undefined) out[key] = d;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  return JSON.stringify(base) === JSON.stringify(cur) ? undefined : structuredClone(cur);
}

/** 기본값과 다른 부분만 뽑는다. 같으면 `{}` */
export function diffSettings(defaults: SurveySettings, effective: SurveySettings): SurveySettingsOverrides {
  return (diffDeep(defaults, effective) ?? {}) as SurveySettingsOverrides;
}

const fieldLabel = (id: FieldId): string => DETAIL_COLUMNS[FIELD_BY_ID[id].column].header;

/** 저장 전 검사. 오류 메시지 목록(비면 통과) */
export function validateSettings(settings: SurveySettings): string[] {
  const errors: string[] = [];

  for (const rule of FIELD_RULES) {
    const seen = new Set<string>();
    for (const a of settings.fields[rule.id].aliases) {
      const from = a.from.trim();
      if (from === "") errors.push(`${fieldLabel(rule.id)}: 치환표의 원본이 비어 있습니다`);
      else if (seen.has(from)) errors.push(`${fieldLabel(rule.id)}: 치환표 원본이 중복됩니다 (${from})`);
      seen.add(from);
    }
  }

  if (settings.station.cutTokens.length === 0 || settings.station.cutTokens.some((t) => t === "")) {
    errors.push("국사: 자르는 구분 목록이 비어 있습니다");
  }
  if (settings.station.scanWords.length === 0 || settings.station.scanWords.some((t) => t === "")) {
    errors.push("국사: SCAN 국사 단어 목록이 비어 있습니다");
  }
  if (settings.fields.notes.enabled && settings.notes.separator === "") {
    errors.push("문제점 세부내역: 항목 구분자가 비어 있습니다");
  }

  const modes = new Set<string>();
  for (const set of settings.modeRules) {
    if (modes.has(set.mode)) errors.push(`방식별 예외: 방식이 중복됩니다 (${set.mode})`);
    modes.add(set.mode);
    const fields = new Set<FieldId>();
    for (const r of set.rules) {
      if (fields.has(r.field)) errors.push(`방식별 예외 (${set.mode}): ${fieldLabel(r.field)} 규칙이 중복됩니다`);
      fields.add(r.field);
    }
  }

  const known = new Set<string>();
  for (const m of settings.knownModes) {
    if (m.trim() === "") errors.push("알려진 방식 목록에 빈 값이 있습니다");
    else if (known.has(m)) errors.push(`알려진 방식 목록이 중복됩니다 (${m})`);
    known.add(m);
  }

  return errors;
}
