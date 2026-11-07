import type { DayRow } from "@/features/schedule/lib/day-rows";
import {
  REF_KEYS,
  type DayDetailPatch,
  type DayValues,
  type RefKey,
  type RefValues,
} from "@/features/schedule/lib/day-types";

/** 한 행 상세 창에서 고치는 입력·자동 열(`DayDetail`의 글 칸). */
export const DETAIL_FIELD_KEYS = [
  "workCategory",
  "levelLabel",
  "workTime",
  "workType",
  "equipment",
  "workContent",
  "workDetail",
  "worker",
  "witness",
  "signaler",
] as const;
export type DetailFieldKey = (typeof DETAIL_FIELD_KEYS)[number];

/** 여러 행 일괄 적용에서 바꿀 수 있는 열. */
export const BULK_FIELD_KEYS = [
  "workCategory",
  "workTime",
  "workType",
  "equipment",
  "workContent",
  "workDetail",
] as const satisfies readonly DetailFieldKey[];

export type DetailFormKey = DetailFieldKey | RefKey;
/** 창의 입력 상태: 칸마다 글 하나. */
export type DetailForm = Record<DetailFormKey, string>;

const FORM_KEYS: readonly DetailFormKey[] = [...DETAIL_FIELD_KEYS, ...REF_KEYS];

/** 일괄 적용용 빈 폼(모두 비어 있음 = 아무것도 바꾸지 않음). */
export function emptyForm(): DetailForm {
  return Object.fromEntries(FORM_KEYS.map((key) => [key, ""])) as DetailForm;
}

/** 행의 지금 표시 값으로 채운 폼. 그대로 두면 아무 칸도 바뀐 것이 아니다. */
export function formFromValues(values: DayValues): DetailForm {
  return Object.fromEntries(FORM_KEYS.map((key) => [key, values[key]])) as DetailForm;
}

const isRefKey = (key: DetailFormKey): key is RefKey => (REF_KEYS as readonly string[]).includes(key);

/**
 * 한 행: 표시 값과 달라진 칸만 담는다. 글자 앞뒤 공백은 자르고, 지운 칸은 빈 글(`""`)로 보낸다.
 * 참조 열은 `overrides`로 보내며 빈 글은 덮어쓰기를 지워 자동값으로 돌려 보낸다.
 */
function buildSinglePatch(values: DayValues, form: DetailForm): DayDetailPatch {
  const patch: DayDetailPatch = {};
  const overrides: RefValues = {};
  for (const key of FORM_KEYS) {
    if (form[key] === values[key]) continue;
    const next = form[key].trim();
    if (next === values[key]) continue;
    if (isRefKey(key)) overrides[key] = next;
    else patch[key] = next;
  }
  if (Object.keys(overrides).length > 0) patch.overrides = overrides;
  return patch;
}

/** 여러 행: 일괄 열 중 채운(공백이 아닌) 칸만 담는다. 빈 칸은 그대로 두는 뜻이다. */
function buildBulkPatch(form: DetailForm): DayDetailPatch {
  const patch: DayDetailPatch = {};
  for (const key of BULK_FIELD_KEYS) {
    const next = form[key].trim();
    if (next !== "") patch[key] = next;
  }
  return patch;
}

/**
 * 저장할 패치 목록. 행이 하나면 그 행의 표시 값과 비교하고, 여럿이면 채운 일괄 열을 모든 행에 적용한다.
 * 바뀐 것이 없는 행은 목록에 넣지 않는다(빈 패치로 저장하지 않는다).
 */
export function buildDetailPatches(
  rows: readonly DayRow[],
  form: DetailForm,
): { station: DayRow; patch: DayDetailPatch }[] {
  const bulkPatch = rows.length > 1 ? buildBulkPatch(form) : null;
  return rows
    .map((station) => ({ station, patch: bulkPatch ? { ...bulkPatch } : buildSinglePatch(station.values, form) }))
    .filter(({ patch }) => Object.keys(patch).length > 0);
}
