import { NextRequest, NextResponse } from "next/server";
import { guardProxyRequest } from "@/lib/api/proxy-guard";
import { DISCLAIMER } from "@/features/worksite-weather/constants/thresholds";
import { resolveWarnStnId } from "@/features/worksite-weather/constants/kma-regions";
import {
  buildTyphoonFromAlerts,
  fetchUltraSrtFcst,
  fetchUltraSrtNcst,
  fetchVilageFcst,
  fetchWeatherAlerts,
  KmaError,
} from "@/features/worksite-weather/lib/kma-client";
import {
  baseToIsoKst,
  currentKstHhmm,
  getUltraFcstBase,
  getUltraNcstBase,
  getVilageBaseForToday,
  isoDateKst,
  ymdKst,
} from "@/features/worksite-weather/lib/kma-base-time";
import { isGridInKorea, toGrid } from "@/features/worksite-weather/lib/grid";
import {
  buildTimeline,
  collectForecastSlots,
  collectObservation,
  countMissingSlots,
} from "@/features/worksite-weather/lib/merge-sources";
import {
  alertsVerdict,
  buildHazardSummary,
  findRecommendedWindows,
  overallVerdict,
  worstVerdict,
} from "@/features/worksite-weather/lib/verdict";
import type {
  Verdict,
  WorksiteWeatherResponse,
  WorkType,
} from "@/features/worksite-weather/types/weather";

/** 좌표 해석은 클라이언트 책임이므로 이 라우트는 좌표만 받는다. (CR-004 §6) */
function parseWorkType(raw: string | null): WorkType {
  return raw === "elevated" ? "elevated" : "ground";
}

export async function GET(request: NextRequest) {
  const blocked = guardProxyRequest(request);
  if (blocked) return blocked;

  const params = request.nextUrl.searchParams;
  const rawLat = params.get("lat");
  const rawLng = params.get("lng");

  // Number(null)·Number("")은 0이라 그대로 파싱하면 미지정이 좌표 (0,0)으로 통과한다
  if (!rawLat?.trim() || !rawLng?.trim()) {
    return NextResponse.json(
      { error: "lat, lng 파라미터가 필요합니다." },
      { status: 400 },
    );
  }

  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "lat, lng 파라미터가 올바른 숫자가 아닙니다." },
      { status: 400 },
    );
  }

  const grid = toGrid(lat, lng);
  if (!isGridInKorea(grid)) {
    return NextResponse.json(
      { error: "기상청 격자 범위를 벗어난 좌표입니다. 국내 좌표만 조회할 수 있습니다." },
      { status: 400 },
    );
  }

  const workType = parseWorkType(params.get("workType"));
  const now = new Date();
  const targetDate = ymdKst(now);
  const vilageBase = getVilageBaseForToday(now);
  const ncstBase = getUltraNcstBase(now);
  const ultraBase = getUltraFcstBase(now);
  const region = params.get("region") ?? "";
  const stnId = resolveWarnStnId(region);

  try {
    // 동시 외부 연결 6개 제한에 여유를 두기 위해 4건으로 묶는다
    const [vilageItems, ncstItems, ultraItems, alertResult] = await Promise.all([
      fetchVilageFcst({ nx: grid.nx, ny: grid.ny, base: vilageBase }),
      fetchUltraSrtNcst({ nx: grid.nx, ny: grid.ny, base: ncstBase }).catch(() => []),
      fetchUltraSrtFcst({ nx: grid.nx, ny: grid.ny, base: ultraBase }).catch(() => []),
      fetchWeatherAlerts(stnId, targetDate, ymdKst(now, -1), region).catch(() => ({
        alerts: [],
        parsed: false,
      })),
    ]);

    const nowHhmm = currentKstHhmm(now);
    const timeline = buildTimeline({
      targetDate,
      vilage: collectForecastSlots(vilageItems, targetDate),
      ultra: collectForecastSlots(ultraItems, targetDate),
      observation: collectObservation(ncstItems),
      observationTime: ncstBase.baseTime,
      nowHhmm,
      workType,
    });

    const warnings: string[] = [];
    const missingCount = countMissingSlots(timeline);
    if (missingCount > 0) {
      warnings.push(
        `${missingCount}개 시간대의 예보가 결측되어 판정할 수 없습니다. 추정값을 채우지 않았습니다.`,
      );
    }
    if (!alertResult.parsed) {
      warnings.push(
        "기상특보를 확인하지 못했습니다. 특보 발효 여부를 기상청에서 별도로 확인하세요.",
      );
    }

    const typhoon = buildTyphoonFromAlerts(alertResult.alerts);

    // 특보는 종류별로 반영 강도가 다르다 (폭염경보를 일괄 중지로 보면 여름 내내 ⛔가 된다)
    let overall: Verdict = worstVerdict(
      overallVerdict(timeline),
      alertsVerdict(alertResult.alerts),
    );
    if (typhoon) overall = "stop";

    const payload: WorksiteWeatherResponse = {
      site: { lat, lng, grid, workType },
      date: isoDateKst(now),
      issuedAt: baseToIsoKst(vilageBase),
      overall,
      recommendedWindows: typhoon ? [] : findRecommendedWindows(timeline, nowHhmm),
      timeline,
      hazardSummary: buildHazardSummary(timeline, workType),
      alerts: alertResult.alerts,
      typhoon,
      warnings,
      disclaimer: DISCLAIMER,
    };

    return NextResponse.json(payload, {
      headers: {
        // 단기예보는 3시간마다 갱신되므로 브라우저 재조회를 그만큼 억제한다
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch (error) {
    if (error instanceof KmaError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: "기상 정보를 가져오지 못했습니다. 잠시 후 다시 시도하세요." },
      { status: 502 },
    );
  }
}
