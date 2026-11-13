import "server-only";
import { buildDataInfo } from "@/features/worksite-weather/lib/kma-data-info";
import { readLatestForecast } from "@/features/worksite-weather/lib/kma-forecast-store";
import {
  FORECAST_KINDS,
  type ForecastKind,
  type GridKey,
} from "@/features/worksite-weather/lib/kma-prefetch-plan";
import type { KmaBase } from "@/features/worksite-weather/lib/kma-base-time";
import type { KmaItem } from "@/features/worksite-weather/lib/merge-sources";
import type { WeatherDataInfo } from "@/features/worksite-weather/types/weather";

export interface ForecastItems {
  vilage: KmaItem[];
  ncst: KmaItem[];
  ufcst: KmaItem[];
}

export interface StoredForecastResult {
  /** 종류별 예보. 저장분이 없는 종류는 빈 배열 */
  items: ForecastItems;
  /** 저장분의 기준시각(없는 종류는 빠진다). 관측 시각·발표 시각 표시는 이 값을 쓴다 */
  bases: Partial<Record<ForecastKind, KmaBase>>;
  /** 화면에 보여 줄 수집 정보 */
  info: WeatherDataInfo;
}

/**
 * 한 격자의 예보 세 종류를 **저장된 가장 최근 값**으로 모은다.
 * 이 경로는 기상청을 부르지 않는다. 사용자가 화면을 열어도 호출이 늘지 않는다.
 * 저장분은 자동 수집(매시)과 [현재 데이터로 갱신] 버튼이 채운다.
 * 저장분이 없거나 DB가 실패하면 빈 배열과 `info.missing`으로 알리고 던지지 않는다.
 */
export async function loadStoredForecast(grid: GridKey): Promise<StoredForecastResult> {
  const stored = await readLatestForecast(grid);

  const items: ForecastItems = { vilage: [], ncst: [], ufcst: [] };
  const bases: Partial<Record<ForecastKind, KmaBase>> = {};
  for (const kind of FORECAST_KINDS) {
    const row = stored[kind];
    if (!row) continue;
    items[kind] = row.items;
    bases[kind] = row.base;
  }

  return { items, bases, info: buildDataInfo(stored) };
}
