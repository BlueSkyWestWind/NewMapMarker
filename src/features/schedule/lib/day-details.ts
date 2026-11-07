import type { DayDetail, DayDetailPatch, RefValues } from "@/features/schedule/lib/day-types";

/**
 * 저장할 상세 한 행을 만든다: `base`(DB에서 방금 읽은 행, 없으면 빈 행)에 `patch`를 얹는다.
 * - 패치에 있는 칸은 바꾼다(빈 글 `""`도 그대로 — `null`로 바꾸지 않는다). 없는(`undefined`) 칸은 `base` 값을 둔다.
 * - `overrides`는 키별로 합친다. 값이 `""`인 키는 덮어쓰기를 지우고, 패치에 없는 키는 그대로 둔다.
 */
export function mergeDetailPatch(
  base: DayDetail | undefined,
  key: { workDate: string; stationKey: string; site: string },
  patch: DayDetailPatch,
): DayDetail {
  const start: DayDetail = base ?? {
    ...key,
    workCategory: null,
    levelLabel: null,
    workTime: null,
    workType: null,
    equipment: null,
    workContent: null,
    workDetail: null,
    worker: null,
    witness: null,
    signaler: null,
    overrides: {},
  };

  const { overrides: overridePatch, ...fields } = patch;
  const defined = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));

  const overrides: RefValues = { ...start.overrides };
  for (const [refKey, value] of Object.entries(overridePatch ?? {}) as [keyof RefValues, string | undefined][]) {
    if (value === undefined) continue;
    if (value === "") delete overrides[refKey];
    else overrides[refKey] = value;
  }

  return { ...start, ...defined, workDate: key.workDate, stationKey: key.stationKey, site: key.site, overrides };
}
