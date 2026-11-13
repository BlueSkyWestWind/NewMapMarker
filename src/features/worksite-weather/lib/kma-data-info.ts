// 저장된 예보에서 화면용 "수집 정보"를 만드는 순수 함수. 서버·테스트 모두에서 쓰므로 server-only를 쓰지 않는다.

import { baseToIsoKst } from "@/features/worksite-weather/lib/kma-base-time";
import type { StoredForecast } from "@/features/worksite-weather/lib/kma-forecast-store";
import { FORECAST_KINDS, type ForecastKind } from "@/features/worksite-weather/lib/kma-prefetch-plan";
import type { DataSource, WeatherDataInfo } from "@/features/worksite-weather/types/weather";

type StoredByKind = Partial<Record<ForecastKind, StoredForecast>>;

/** DB의 source 값을 화면에 보이는 출처로 바꾼다 */
export function toDataSource(dbSource: StoredForecast["source"]): DataSource {
  if (dbSource === "prefetch") return "auto";
  if (dbSource === "manual") return "manual";
  return "screen";
}

export function buildDataInfo(stored: StoredByKind): WeatherDataInfo {
  const bases: WeatherDataInfo["bases"] = { vilage: null, ncst: null, ufcst: null };
  const missing: ForecastKind[] = [];
  let latest: StoredForecast | null = null;

  for (const kind of FORECAST_KINDS) {
    const row = stored[kind];
    if (!row) {
      missing.push(kind);
      continue;
    }
    bases[kind] = baseToIsoKst(row.base);
    if (!latest || Date.parse(row.fetchedAt) > Date.parse(latest.fetchedAt)) latest = row;
  }

  return {
    bases,
    collectedAt: latest ? latest.fetchedAt : null,
    collectedBy: latest ? toDataSource(latest.source) : null,
    missing,
  };
}

/** 어느 종류든 `minIntervalMs` 안에 저장됐는가(정확히 그 시간 전은 아니다) */
export function isRecentlyCollected(stored: StoredByKind, now: Date, minIntervalMs: number): boolean {
  return FORECAST_KINDS.some((kind) => {
    const row = stored[kind];
    return row !== undefined && now.getTime() - Date.parse(row.fetchedAt) < minIntervalMs;
  });
}
