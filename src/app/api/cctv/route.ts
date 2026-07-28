import { NextRequest, NextResponse } from "next/server";
import { guardProxyRequest } from "@/lib/api/proxy-guard";
import {
  GWANGJU_JEONNAM_BBOX,
  ROAD_TYPES,
  type BoundingBox,
} from "@/features/cctv/constants/its-config";
import { buildCctvSurvey } from "@/features/cctv/lib/build-survey";
import {
  collectFieldNames,
  fetchCctvByRoadType,
  hasRoadSectionField,
  ItsError,
} from "@/features/cctv/lib/its-client";
import type { CctvItem, CctvResponse } from "@/features/cctv/types/cctv";

const NOTICE =
  "경계상자는 사각형이라 전북 남부·경남 서부가 섞여 있습니다. " +
  "정확한 광주·전남 대수는 행정경계 클리핑 후에 나옵니다.";

/** 쿼리에서 bbox를 읽는다. 하나라도 빠지면 계획서 §2.2 기본값을 쓴다. */
function parseBbox(params: URLSearchParams): BoundingBox | null {
  const keys = ["minX", "maxX", "minY", "maxY"] as const;
  const raw = keys.map((k) => params.get(k));
  if (raw.every((v) => v === null)) return GWANGJU_JEONNAM_BBOX;
  if (raw.some((v) => v === null || v.trim() === "")) return null;

  const [minX, maxX, minY, maxY] = raw.map((v) => Number(v));
  if ([minX, maxX, minY, maxY].some((n) => !Number.isFinite(n))) return null;
  if (minX >= maxX || minY >= maxY) return null;

  return { minX, maxX, minY, maxY };
}

export async function GET(request: NextRequest) {
  const blocked = guardProxyRequest(request);
  if (blocked) return blocked;

  const params = request.nextUrl.searchParams;

  const bbox = parseBbox(params);
  if (!bbox) {
    return NextResponse.json(
      { error: "경계상자 파라미터(minX, maxX, minY, maxY)가 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const requested = params.get("roadTypes");
  const roadTypes = requested
    ? requested.split(",").map((t) => t.trim()).filter(Boolean)
    : ROAD_TYPES.map((t) => t.code);

  const allowed = new Set<string>(ROAD_TYPES.map((t) => t.code));
  if (roadTypes.length === 0 || roadTypes.some((t) => !allowed.has(t))) {
    return NextResponse.json(
      { error: `roadTypes는 ${[...allowed].join(", ")} 중에서 지정하세요.` },
      { status: 400 },
    );
  }

  const items: CctvItem[] = [];
  const warnings: string[] = [];
  let sawRoadSectionField = false;
  const sampleFields = new Set<string>();
  let authError: string | null = null;

  // 도로 종별로 나누어 호출한다. 한쪽이 실패해도 나머지는 살린다.
  const results = await Promise.all(
    roadTypes.map(async (roadType) => {
      try {
        return { roadType, result: await fetchCctvByRoadType(roadType, bbox) };
      } catch (error) {
        const message = error instanceof ItsError ? error.message : "조회에 실패했습니다.";
        // 인증키 문제는 부분 실패가 아니라 전체 실패다
        if (message.includes("인증키")) authError = message;
        return { roadType, error: message };
      }
    }),
  );

  if (authError) {
    return NextResponse.json({ error: authError }, { status: 502 });
  }

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
      warnings.push(`${entry.roadType}: 응답에서 행을 찾지 못했습니다 (구조: ${entry.result.shape})`);
    }
  }

  // 같은 CCTV가 도로 종별을 넘나들며 중복될 수 있다
  const deduped = [...new Map(items.map((item) => [item.id, item])).values()];

  const payload: CctvResponse = {
    bbox,
    roadTypes,
    items: deduped,
    survey: buildCctvSurvey(deduped, sawRoadSectionField, [...sampleFields].sort()),
    warnings,
    notice: NOTICE,
  };

  // 브라우저 캐시를 두지 않는다. 사전조사 단계에서는 응답 스키마가 바뀔 수 있는데,
  // 캐시된 구버전 응답이 화면에 섞이면 진단 자체가 어긋난다.
  // 재요청 억제는 TanStack Query의 staleTime(30분)이 담당한다.
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
