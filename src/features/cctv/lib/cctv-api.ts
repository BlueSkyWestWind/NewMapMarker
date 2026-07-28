import { ROAD_TYPES, type BoundingBox } from "@/features/cctv/constants/its-config";
import { buildCctvSurvey } from "@/features/cctv/lib/build-survey";
import {
  collectFieldNames,
  fetchCctvByRoadType,
  hasRoadSectionField,
  ItsError,
} from "@/features/cctv/lib/its-client";
import type { CctvItem, CctvResponse } from "@/features/cctv/types/cctv";

export interface CctvQuery {
  bbox: BoundingBox;
  roadTypes: string[];
}

const NOTICE =
  "경계상자는 사각형이라 전북 남부·경남 서부가 섞여 있습니다. " +
  "정확한 광주·전남 대수는 행정경계 클리핑 후에 나옵니다.";

export function cctvQueryKey(query: CctvQuery): string {
  const { minX, maxX, minY, maxY } = query.bbox;
  return [minX, maxX, minY, maxY, [...query.roadTypes].sort().join("+")].join("|");
}

/**
 * 브라우저에서 ITS를 직접 조회한다.
 *
 * 서버 경유가 전부 막혀 자기 서버 라우트를 두지 않는다(계획서 부록 E).
 * 도로 종별로 나누어 부르고 **한쪽이 실패해도 나머지는 살린다** —
 * 고속도로만 받아도 지도에 올릴 값어치가 있다.
 */
export async function fetchCctv(query: CctvQuery): Promise<CctvResponse> {
  const allowed = new Set<string>(ROAD_TYPES.map((t) => t.code));
  const roadTypes = query.roadTypes.filter((type) => allowed.has(type));
  if (roadTypes.length === 0) {
    throw new Error(`도로 종별을 ${[...allowed].join(", ")} 중에서 선택하세요.`);
  }

  const results = await Promise.all(
    roadTypes.map(async (roadType) => {
      try {
        return { roadType, result: await fetchCctvByRoadType(roadType, query.bbox) };
      } catch (error) {
        const message =
          error instanceof ItsError ? error.message : "조회에 실패했습니다.";
        return { roadType, error: message };
      }
    }),
  );

  // 인증키 문제는 부분 실패가 아니라 전체 실패다. 경고로 흘리면 원인이 묻힌다.
  const authError = results.find(
    (entry) => "error" in entry && entry.error?.includes("인증키"),
  );
  if (authError && "error" in authError) {
    throw new Error(authError.error);
  }

  const items: CctvItem[] = [];
  const warnings: string[] = [];
  const sampleFields = new Set<string>();
  let sawRoadSectionField = false;

  for (const entry of results) {
    if ("error" in entry && entry.error) {
      warnings.push(`${entry.roadType} 조회 실패: ${entry.error}`);
      continue;
    }
    if (!("result" in entry) || !entry.result) continue;

    if (hasRoadSectionField(entry.result.rows)) sawRoadSectionField = true;
    for (const name of collectFieldNames(entry.result.rows)) sampleFields.add(name);
    items.push(...entry.result.items);

    // 호출은 성공했는데 행이 0건이면 응답 구조가 예상과 다를 수 있다.
    // 실제 모양을 남겨야 "CCTV가 없는 것"과 "파싱이 안 된 것"을 구분할 수 있다.
    if (entry.result.rows.length === 0) {
      warnings.push(
        `${entry.roadType}: 응답에서 행을 찾지 못했습니다 (구조: ${entry.result.shape})`,
      );
    }
  }

  // 같은 CCTV가 도로 종별을 넘나들며 중복될 수 있다
  const deduped = [...new Map(items.map((item) => [item.id, item])).values()];

  return {
    bbox: query.bbox,
    roadTypes,
    items: deduped,
    survey: buildCctvSurvey(deduped, sawRoadSectionField, [...sampleFields].sort()),
    warnings,
    notice: NOTICE,
  };
}
