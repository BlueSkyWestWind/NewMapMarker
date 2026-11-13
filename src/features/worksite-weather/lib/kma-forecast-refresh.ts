import "server-only";
import {
  fetchUltraSrtFcst,
  fetchUltraSrtNcst,
  fetchVilageFcst,
} from "@/features/worksite-weather/lib/kma-client";
import type { KmaBase } from "@/features/worksite-weather/lib/kma-base-time";
import { isRecentlyCollected } from "@/features/worksite-weather/lib/kma-data-info";
import {
  readLatestForecast,
  saveForecast,
  type ForecastRow,
  type StoredForecast,
} from "@/features/worksite-weather/lib/kma-forecast-store";
import {
  currentBases,
  type ForecastKind,
  type GridKey,
} from "@/features/worksite-weather/lib/kma-prefetch-plan";
import {
  MANUAL_REFRESH_MIN_INTERVAL_MS,
  MAX_GRIDS_PER_REFRESH_REQUEST,
} from "@/features/worksite-weather/constants/kma-refresh";
import type { KmaItem } from "@/features/worksite-weather/lib/merge-sources";

export { MANUAL_REFRESH_MIN_INTERVAL_MS, MAX_GRIDS_PER_REFRESH_REQUEST };

export type RefreshOutcome = {
  nx: number;
  ny: number;
  status: "refreshed" | "recent" | "failed";
  /** 받은 값을 DB에 저장했는가. false면 화면이 옛 저장분을 그대로 보여 준다 */
  saved: boolean;
  error?: string;
};

export interface RefreshDeps {
  readLatest(grid: GridKey): Promise<Partial<Record<ForecastKind, StoredForecast>>>;
  /** 기상청에서 새로 받는다(isolate 캐시를 건너뛰고 `manual`로 집계) */
  fetchKind(kind: ForecastKind, grid: GridKey, base: KmaBase): Promise<KmaItem[]>;
  save(rows: ForecastRow[]): Promise<void>;
}

export function defaultRefreshDeps(): RefreshDeps {
  return {
    readLatest: readLatestForecast,
    fetchKind: (kind, grid, base) => {
      const query = { nx: grid.nx, ny: grid.ny, base };
      const opts = { source: "manual" as const, fresh: true };
      if (kind === "vilage") return fetchVilageFcst(query, opts);
      return kind === "ncst" ? fetchUltraSrtNcst(query, opts) : fetchUltraSrtFcst(query, opts);
    },
    save: saveForecast,
  };
}

/** 저장을 시도한다. `manual`이 거부되면(3단계 마이그레이션 전) `user`로 한 번 더 저장해 본다 */
async function trySave(deps: RefreshDeps, rows: ForecastRow[]): Promise<boolean> {
  try {
    await deps.save(rows);
    return true;
  } catch {
    try {
      await deps.save(rows.map((row) => ({ ...row, source: "user" as const })));
      return true;
    } catch {
      return false;
    }
  }
}

async function refreshOne(grid: GridKey, now: Date, deps: RefreshDeps): Promise<RefreshOutcome> {
  const stored = await deps.readLatest(grid);
  if (isRecentlyCollected(stored, now, MANUAL_REFRESH_MIN_INTERVAL_MS)) {
    return { ...grid, status: "recent", saved: false };
  }

  const bases = currentBases(now);
  const rows: ForecastRow[] = [];
  const add = (kind: ForecastKind, items: KmaItem[]) => {
    // 빈 응답은 저장하지 않는다(한 시간 내내 "자료 없음"을 진실로 두지 않는다)
    if (items.length === 0) return;
    rows.push({
      nx: grid.nx,
      ny: grid.ny,
      kind,
      baseDate: bases[kind].baseDate,
      baseTime: bases[kind].baseTime,
      items,
      source: "manual",
    });
  };

  try {
    add("vilage", await deps.fetchKind("vilage", grid, bases.vilage));
  } catch (err) {
    return {
      ...grid,
      status: "failed",
      saved: false,
      error: err instanceof Error ? err.message : "단기예보를 받지 못했습니다.",
    };
  }
  // 초단기 둘은 실패하면 그 종류만 건너뛴다(기존 조회와 같은 동작)
  for (const kind of ["ncst", "ufcst"] as const) {
    try {
      add(kind, await deps.fetchKind(kind, grid, bases[kind]));
    } catch {
      // 다음 갱신이나 자동 수집이 채운다
    }
  }

  if (rows.length === 0) {
    return { ...grid, status: "failed", saved: false, error: "받은 자료가 비어 있습니다." };
  }
  return { ...grid, status: "refreshed", saved: await trySave(deps, rows) };
}

/**
 * 격자들을 **순서대로** 새로 받아 저장한다. 같은 격자는 한 번만 처리하고,
 * 최근 5분 안에 저장된 격자는 건너뛴다. 격자가 `MAX_GRIDS_PER_REFRESH_REQUEST`를 넘으면 던진다.
 */
export async function refreshGrids(
  grids: GridKey[],
  now: Date,
  deps: RefreshDeps = defaultRefreshDeps(),
): Promise<RefreshOutcome[]> {
  const unique = [...new Map(grids.map((g) => [`${g.nx},${g.ny}`, g])).values()];
  if (unique.length > MAX_GRIDS_PER_REFRESH_REQUEST) {
    throw new Error(`한 번에 갱신할 수 있는 격자는 ${MAX_GRIDS_PER_REFRESH_REQUEST}개까지입니다.`);
  }
  const outcomes: RefreshOutcome[] = [];
  for (const grid of unique) outcomes.push(await refreshOne(grid, now, deps));
  return outcomes;
}
