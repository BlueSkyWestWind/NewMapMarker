import "server-only";
import {
  fetchUltraSrtFcst,
  fetchUltraSrtNcst,
  fetchVilageFcst,
} from "@/features/worksite-weather/lib/kma-client";
import {
  readStoredForecast,
  saveForecastInBackground,
  type ForecastRow,
} from "@/features/worksite-weather/lib/kma-forecast-store";
import { currentBases } from "@/features/worksite-weather/lib/kma-prefetch-plan";
import type { KmaItem } from "@/features/worksite-weather/lib/merge-sources";

export interface ForecastItems {
  vilage: KmaItem[];
  ncst: KmaItem[];
  ufcst: KmaItem[];
}

/**
 * 한 격자의 예보 세 종류를 모은다. 저장분(기준시각이 지금 계산한 것과 정확히 같은 것)을 먼저 쓰고,
 * 빠진 것만 실시간으로 받아 DB에 채운다. 그래서 같은 시각대의 다음 사용자는 기상청을 다시 부르지 않는다.
 *
 * 실패 동작은 기존 라우트와 같다: 단기예보는 던지고, 초단기 둘은 빈 배열로 계속한다.
 * 저장소(DB)가 없거나 실패해도 항상 실시간으로 동작한다.
 */
export async function loadForecastItems(args: {
  nx: number;
  ny: number;
  now: Date;
}): Promise<ForecastItems> {
  const { nx, ny, now } = args;
  const bases = currentBases(now);
  const stored = await readStoredForecast({ nx, ny }, bases);

  const [vilage, ncst, ufcst] = await Promise.all([
    stored.vilage ?? fetchVilageFcst({ nx, ny, base: bases.vilage }, { source: "user" }),
    stored.ncst ?? fetchUltraSrtNcst({ nx, ny, base: bases.ncst }, { source: "user" }).catch(() => []),
    stored.ufcst ?? fetchUltraSrtFcst({ nx, ny, base: bases.ufcst }, { source: "user" }).catch(() => []),
  ]);

  // 방금 실시간으로 받은 비어 있지 않은 것만 채운다(빈 응답을 한 시간 내내 진실로 두지 않는다)
  const fresh: ForecastRow[] = [];
  const consider = (kind: ForecastRow["kind"], items: KmaItem[], wasStored: boolean) => {
    if (wasStored || items.length === 0) return;
    fresh.push({
      nx,
      ny,
      kind,
      baseDate: bases[kind].baseDate,
      baseTime: bases[kind].baseTime,
      items,
      source: "user",
    });
  };
  consider("vilage", vilage, stored.vilage !== undefined);
  consider("ncst", ncst, stored.ncst !== undefined);
  consider("ufcst", ufcst, stored.ufcst !== undefined);
  if (fresh.length > 0) saveForecastInBackground(fresh);

  return { vilage, ncst, ufcst };
}
