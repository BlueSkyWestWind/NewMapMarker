import { ROAD_TYPES, roadTypeLabel } from "@/features/cctv/constants/its-config";
import { hasDirectionHint, parseCctvDirection } from "@/features/cctv/lib/parse-direction";
import type { CctvItem, CctvSurvey } from "@/features/cctv/types/cctv";

/**
 * 계획서 §10 선결 확인 1·2번에 답하는 집계.
 *
 * 원래는 별도 Python 스크립트(`cctv_survey.py`)로 확인하도록 되어 있었으나,
 * 인증키만 있으면 앱에서 바로 결과를 볼 수 있도록 같은 판정을 여기서 수행한다.
 */

/** §10.2 판정 기준 — 채움률에 따라 후속 공정 범위가 갈린다 */
const DIRECT_USE_THRESHOLD = 95;
const PARTIAL_USE_THRESHOLD = 50;
/** 방향정보 없음이 이 비율을 넘으면 수동 보정 화면이 필요하다 */
const MANUAL_UI_THRESHOLD = 30;

const TOP_TOWARD_LIMIT = 15;

export function buildCctvSurvey(
  items: CctvItem[],
  hasRoadSectionField: boolean,
  sampleFields: string[] = [],
): CctvSurvey {
  const total = items.length;

  const roadSectionFilled = items.filter((item) => Boolean(item.roadSectionId)).length;
  const roadSectionFilledPercent = total === 0 ? 0 : (roadSectionFilled / total) * 100;

  // 수집 0건이면 판정하지 않는다. 없는 데이터로 "공간매칭 필요"라고 단정하면
  // 조회가 안 된 것과 필드가 없는 것이 같은 결론으로 보인다.
  let roadSectionVerdict: CctvSurvey["roadSectionVerdict"] = "판정불가";
  if (total > 0) {
    roadSectionVerdict = "공간매칭필요";
    if (hasRoadSectionField) {
      if (roadSectionFilledPercent >= DIRECT_USE_THRESHOLD) roadSectionVerdict = "직접사용";
      else if (roadSectionFilledPercent >= PARTIAL_USE_THRESHOLD) roadSectionVerdict = "부분활용";
    }
  }

  let directionUpDown = 0;
  let directionToward = 0;
  let directionArrow = 0;
  let directionNone = 0;
  const towardCounts = new Map<string, number>();

  for (const item of items) {
    const name = item.name ?? "";
    if (name.includes("상행") || name.includes("하행")) {
      directionUpDown += 1;
    }

    const parsed = parseCctvDirection(name);
    if (parsed.target) {
      directionToward += 1;
      towardCounts.set(parsed.target, (towardCounts.get(parsed.target) ?? 0) + 1);
    }

    if (["↑", "↓", "→", "←"].some((arrow) => name.includes(arrow))) {
      directionArrow += 1;
    }

    if (!hasDirectionHint(name)) directionNone += 1;
  }

  const directionNonePercent = total === 0 ? 0 : (directionNone / total) * 100;

  const topTowards = [...towardCounts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, "ko"))
    .slice(0, TOP_TOWARD_LIMIT);

  const byRoadType = ROAD_TYPES.map(({ code }) => ({
    code,
    label: roadTypeLabel(code),
    count: items.filter((item) => item.roadType === code).length,
  })).filter((entry) => entry.count > 0);

  return {
    total,
    hasRoadSectionField,
    roadSectionFilled,
    roadSectionFilledPercent: Math.round(roadSectionFilledPercent * 10) / 10,
    roadSectionVerdict,
    sampleFields,
    directionUpDown,
    directionToward,
    directionArrow,
    directionNone,
    directionNonePercent: Math.round(directionNonePercent * 10) / 10,
    needsManualDirectionUi: total > 0 && directionNonePercent >= MANUAL_UI_THRESHOLD,
    topTowards,
    byRoadType,
  };
}
