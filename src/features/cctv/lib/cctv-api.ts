import type { BoundingBox } from "@/features/cctv/constants/its-config";
import type { CctvResponse } from "@/features/cctv/types/cctv";

export interface CctvQuery {
  bbox: BoundingBox;
  roadTypes: string[];
}

export function cctvQueryKey(query: CctvQuery): string {
  const { minX, maxX, minY, maxY } = query.bbox;
  return [minX, maxX, minY, maxY, [...query.roadTypes].sort().join("+")].join("|");
}

/**
 * 브라우저 → 자기 서버(`/api/cctv`) 조회.
 * 서버가 500을 내면 본문이 평문이라 그대로 JSON.parse하면 사용자에게 파싱 오류가 노출된다.
 */
export async function fetchCctv(query: CctvQuery): Promise<CctvResponse> {
  const params = new URLSearchParams({
    minX: String(query.bbox.minX),
    maxX: String(query.bbox.maxX),
    minY: String(query.bbox.minY),
    maxY: String(query.bbox.maxY),
    roadTypes: query.roadTypes.join(","),
  });

  const response = await fetch(`/api/cctv?${params.toString()}`);
  const text = await response.text();

  let body: Partial<CctvResponse> & { error?: string } = {};
  let isJson = false;
  try {
    body = JSON.parse(text) as typeof body;
    isJson = true;
  } catch {
    isJson = false;
  }

  if (!response.ok || !isJson) {
    if (isJson && body.error) throw new Error(body.error);
    throw new Error(`CCTV 정보를 가져오지 못했습니다. (서버 응답 ${response.status})`);
  }
  return normalizeCctvResponse(body);
}

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/**
 * 응답을 화면이 기대하는 형태로 맞춘다.
 *
 * 라우트 응답은 `Cache-Control: private, max-age=600`으로 브라우저에 캐시된다.
 * 서버에 필드를 추가한 직후에는 **그 필드가 없는 이전 응답**이 그대로 그려지므로,
 * 화면에서 `.length`·`.map`을 바로 부르면 배포 직후 10분 동안 패널이 깨진다.
 * 배열 필드는 여기서 한 번만 보정한다.
 */
export function normalizeCctvResponse(
  body: Partial<CctvResponse> & { error?: string },
): CctvResponse {
  const survey = (body.survey ?? {}) as Partial<CctvResponse["survey"]>;

  return {
    bbox: body.bbox ?? { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    roadTypes: asArray<string>(body.roadTypes),
    items: asArray(body.items),
    warnings: asArray<string>(body.warnings),
    notice: body.notice ?? "",
    survey: {
      total: survey.total ?? 0,
      hasRoadSectionField: survey.hasRoadSectionField ?? false,
      roadSectionFilled: survey.roadSectionFilled ?? 0,
      roadSectionFilledPercent: survey.roadSectionFilledPercent ?? 0,
      roadSectionVerdict: survey.roadSectionVerdict ?? "판정불가",
      sampleFields: asArray<string>(survey.sampleFields),
      directionUpDown: survey.directionUpDown ?? 0,
      directionToward: survey.directionToward ?? 0,
      directionArrow: survey.directionArrow ?? 0,
      directionNone: survey.directionNone ?? 0,
      directionNonePercent: survey.directionNonePercent ?? 0,
      needsManualDirectionUi: survey.needsManualDirectionUi ?? false,
      topTowards: asArray(survey.topTowards),
      byRoadType: asArray(survey.byRoadType),
    },
  };
}
