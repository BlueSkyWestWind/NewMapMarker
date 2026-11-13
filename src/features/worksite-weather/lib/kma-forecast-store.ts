import "server-only";
import {
  FORECAST_KINDS,
  type CurrentBases,
  type ForecastKind,
  type GridKey,
  type StoredKey,
} from "@/features/worksite-weather/lib/kma-prefetch-plan";
import type { KmaBase } from "@/features/worksite-weather/lib/kma-base-time";
import type { KmaItem } from "@/features/worksite-weather/lib/merge-sources";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const TABLE = "kma_forecast_cache";
const CONFLICT_KEY = "nx,ny,kind,base_date,base_time";
/** PostgREST 기본 최대 행 수 */
const PAGE_SIZE = 1000;

/** 저장소에서 읽은 한 종류의 최신 예보 */
export interface StoredForecast {
  kind: ForecastKind;
  items: KmaItem[];
  base: KmaBase;
  /** 저장된 시각(ISO) */
  fetchedAt: string;
  source: "user" | "prefetch" | "manual";
}

export interface ForecastRow {
  nx: number;
  ny: number;
  kind: ForecastKind;
  baseDate: string;
  baseTime: string;
  items: KmaItem[];
  source: "user" | "prefetch" | "manual";
}

/** 현재 기준시각 세 종류 중 하나와 일치하는 행만 고르는 PostgREST `or` 조건 */
function basesFilter(bases: CurrentBases): string {
  return FORECAST_KINDS.map(
    (kind) => `and(kind.eq.${kind},base_date.eq.${bases[kind].baseDate},base_time.eq.${bases[kind].baseTime})`,
  ).join(",");
}

/**
 * 한 격자의 종류별 **가장 최근 저장분**을 읽는다(기준시각이 지금과 달라도 쓴다).
 * 종류마다 `base_date`·`base_time` 내림차순 1행을 병렬로 조회한다(payload가 큰 행을 한꺼번에 읽지 않는다).
 * 마이그레이션 미적용·DB 오류에서도 던지지 않고 빈 결과를 돌려준다.
 */
export async function readLatestForecast(grid: GridKey): Promise<Partial<Record<ForecastKind, StoredForecast>>> {
  try {
    const admin = getSupabaseAdminClient();
    const results = await Promise.all(
      FORECAST_KINDS.map((kind) =>
        admin
          .from(TABLE)
          .select("kind, base_date, base_time, payload, fetched_at, source")
          .eq("nx", grid.nx)
          .eq("ny", grid.ny)
          .eq("kind", kind)
          .order("base_date", { ascending: false })
          .order("base_time", { ascending: false })
          .limit(1),
      ),
    );

    const found: Partial<Record<ForecastKind, StoredForecast>> = {};
    FORECAST_KINDS.forEach((kind, i) => {
      const { data, error } = results[i];
      const row = error ? undefined : ((data ?? [])[0] as LatestRow | undefined);
      if (row && Array.isArray(row.payload)) {
        found[kind] = {
          kind,
          items: row.payload as KmaItem[],
          base: { baseDate: row.base_date, baseTime: row.base_time },
          fetchedAt: row.fetched_at,
          source: row.source,
        };
      }
    });
    return found;
  } catch {
    return {};
  }
}

interface LatestRow {
  base_date: string;
  base_time: string;
  payload: unknown;
  fetched_at: string;
  source: StoredForecast["source"];
}

/**
 * 현재 기준시각에 이미 저장된 `(격자, kind)` 목록.
 * 실패를 "저장된 게 없다"로 오해하면 전부 다시 받아 버리므로 **오류는 던진다**.
 */
export async function listStoredKeys(bases: CurrentBases): Promise<StoredKey[]> {
  const filter = basesFilter(bases);
  const keys: StoredKey[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await getSupabaseAdminClient()
      .from(TABLE)
      .select("nx, ny, kind")
      .or(filter)
      .order("nx")
      .order("ny")
      .order("kind")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error("저장된 예보 목록을 읽지 못했습니다.");

    const page = (data ?? []) as StoredKey[];
    keys.push(...page);
    if (page.length < PAGE_SIZE) return keys;
  }
}

/** 예보를 저장한다(같은 기준시각이면 덮어쓴다). 실패하면 던진다. */
export async function saveForecast(rows: ForecastRow[]): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await getSupabaseAdminClient()
    .from(TABLE)
    .upsert(
      rows.map((row) => ({
        nx: row.nx,
        ny: row.ny,
        kind: row.kind,
        base_date: row.baseDate,
        base_time: row.baseTime,
        payload: row.items,
        source: row.source,
      })),
      { onConflict: CONFLICT_KEY },
    );
  if (error) throw new Error("예보를 저장하지 못했습니다.");
}
