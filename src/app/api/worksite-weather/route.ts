import { NextRequest, NextResponse } from "next/server";
import { guardProxyRequest } from "@/lib/api/proxy-guard";
import { DISCLAIMER } from "@/features/worksite-weather/constants/thresholds";
import { resolveWarnStnId } from "@/features/worksite-weather/constants/kma-regions";
import {
  buildTyphoonFromAlerts,
  fetchWeatherAlerts,
  KmaError,
} from "@/features/worksite-weather/lib/kma-client";
import { loadStoredForecast } from "@/features/worksite-weather/lib/kma-forecast-source";
import {
  baseToIsoKst,
  currentKstHhmm,
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
  const blocked = await guardProxyRequest(request);
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
  const region = params.get("region") ?? "";
  const stnId = resolveWarnStnId(region);

  try {
    // 예보 3종은 **저장된 가장 최근 값**만 읽는다(기상청을 부르지 않는다). 저장은 자동 수집(매시)과
    // [현재 데이터로 갱신] 버튼이 한다. 특보는 안전 판정에 쓰이므로 지금처럼 실시간(캐시 10분)이다.
    const [{ items: forecast, bases, info: dataInfo }, alertResult] = await Promise.all([
      loadStoredForecast({ nx: grid.nx, ny: grid.ny }),
      fetchWeatherAlerts(stnId, targetDate, ymdKst(now, -1), region).catch(() => ({
        alerts: [],
        parsed: false,
      })),
    ]);

    const nowHhmm = currentKstHhmm(now);
    // 단기예보 저장분이 없으면 판정할 근거가 없다. 지어내지 않고 빈 시간표로 알린다.
    const hasForecast = !dataInfo.missing.includes("vilage");
    const timeline = hasForecast
      ? buildTimeline({
          targetDate,
          vilage: collectForecastSlots(forecast.vilage, targetDate),
          ultra: collectForecastSlots(forecast.ufcst, targetDate),
          observation: collectObservation(forecast.ncst),
          // 관측 시각은 지금 계산한 기준시각이 아니라 저장분의 기준시각이다
          observationTime: bases.ncst?.baseTime ?? "",
          nowHhmm,
          workType,
        })
      : [];

    const warnings: string[] = [];
    if (!hasForecast) {
      warnings.push("저장된 예보가 없습니다. [현재 데이터로 갱신]을 눌러 주세요.");
    }
    const missingCount = hasForecast ? countMissingSlots(timeline) : 0;
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
    let overall: Verdict = hasForecast
      ? worstVerdict(overallVerdict(timeline), alertsVerdict(alertResult.alerts))
      : "unknown";
    if (typhoon) overall = "stop";

    const payload: WorksiteWeatherResponse = {
      site: { lat, lng, grid, workType },
      date: isoDateKst(now),
      issuedAt: bases.vilage ? baseToIsoKst(bases.vilage) : "",
      overall,
      recommendedWindows: typhoon ? [] : findRecommendedWindows(timeline, nowHhmm),
      timeline,
      hazardSummary: buildHazardSummary(timeline, workType),
      alerts: alertResult.alerts,
      typhoon,
      warnings,
      disclaimer: DISCLAIMER,
      dataInfo,
    };

    return NextResponse.json(payload, {
      headers: {
        // 저장분은 갱신 버튼으로 바뀐다. 브라우저가 옛 응답을 돌려주지 않게 한다(DB 읽기라 부담이 작다)
        "Cache-Control": "private, no-store",
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
