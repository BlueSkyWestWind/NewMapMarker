import { NextRequest, NextResponse } from "next/server";
import { guardProxyRequest } from "@/lib/api/proxy-guard";
import { resolveWarnStnId } from "@/features/worksite-weather/constants/kma-regions";
import { isGridInKorea, toGrid } from "@/features/worksite-weather/lib/grid";
import { fetchWeatherAlerts } from "@/features/worksite-weather/lib/kma-client";
import { ymdKst } from "@/features/worksite-weather/lib/kma-base-time";
import {
  MAX_GRIDS_PER_REFRESH_REQUEST,
  refreshGrids,
} from "@/features/worksite-weather/lib/kma-forecast-refresh";

export const dynamic = "force-dynamic";

interface RefreshSite {
  lat: number;
  lng: number;
  region?: string;
}

/** 본문에서 사이트 목록을 검증해 꺼낸다. 형식이 틀리면 null */
function parseSites(body: unknown): RefreshSite[] | null {
  const sites = (body as { sites?: unknown } | null)?.sites;
  if (!Array.isArray(sites) || sites.length < 1 || sites.length > MAX_GRIDS_PER_REFRESH_REQUEST) return null;
  const parsed: RefreshSite[] = [];
  for (const site of sites) {
    const { lat, lng, region } = (site ?? {}) as Record<string, unknown>;
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    parsed.push({ lat, lng, region: typeof region === "string" ? region.slice(0, 20) : undefined });
  }
  return parsed;
}

/**
 * [현재 데이터로 갱신]: 기상청에서 지금 값을 받아 저장한다(로그인 필요).
 * 같은 격자는 5분 안에 다시 받지 않고, 요청 한 번에 격자 최대 5개다.
 * 특보 캐시도 새로 받는다(첫 사이트의 지역 기준).
 */
export async function POST(request: NextRequest) {
  const blocked = await guardProxyRequest(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const sites = parseSites(body);
  if (!sites) {
    return NextResponse.json(
      { error: `sites는 좌표(lat, lng)가 있는 1~${MAX_GRIDS_PER_REFRESH_REQUEST}개여야 합니다.` },
      { status: 400 },
    );
  }

  const grids = sites.map((site) => toGrid(site.lat, site.lng));
  if (!grids.every(isGridInKorea)) {
    return NextResponse.json({ error: "기상청 격자 범위를 벗어난 좌표가 있습니다." }, { status: 400 });
  }

  try {
    const now = new Date();
    const results = await refreshGrids(grids, now);

    // 특보는 안전 판정에 쓰이므로 갱신 때 새로 받는다. 실패해도 예보 갱신 결과는 그대로 돌려준다.
    const region = sites[0].region ?? "";
    let alertsRefreshed = true;
    try {
      await fetchWeatherAlerts(resolveWarnStnId(region), ymdKst(now), ymdKst(now, -1), region, {
        source: "manual",
        fresh: true,
      });
    } catch {
      alertsRefreshed = false;
    }

    return NextResponse.json({ results, alertsRefreshed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "갱신하지 못했습니다. 잠시 후 다시 시도하세요." },
      { status: 502 },
    );
  }
}
