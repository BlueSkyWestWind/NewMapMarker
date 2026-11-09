import "server-only";
import { keepAlive } from "@/features/worksite-weather/lib/keep-alive";
import {
  FORECAST_KINDS,
  type CurrentBases,
  type ForecastKind,
  type GridKey,
  type StoredKey,
} from "@/features/worksite-weather/lib/kma-prefetch-plan";
import type { KmaItem } from "@/features/worksite-weather/lib/merge-sources";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const TABLE = "kma_forecast_cache";
const CONFLICT_KEY = "nx,ny,kind,base_date,base_time";
/** PostgREST 기본 최대 행 수 */
const PAGE_SIZE = 1000;

export interface ForecastRow {
  nx: number;
  ny: number;
  kind: ForecastKind;
  baseDate: string;
  baseTime: string;
  items: KmaItem[];
  source: "user" | "prefetch";
}

/** 현재 기준시각 세 종류 중 하나와 일치하는 행만 고르는 PostgREST `or` 조건 */
function basesFilter(bases: CurrentBases): string {
  return FORECAST_KINDS.map(
    (kind) => `and(kind.eq.${kind},base_date.eq.${bases[kind].baseDate},base_time.eq.${bases[kind].baseTime})`,
  ).join(",");
}

/**
 * 한 격자의 저장분을 **한 번의 조회**로 찾는다. 기준시각이 현재와 정확히 같은 행만 돌려준다.
 * 마이그레이션 미적용·DB 오류에서도 던지지 않고 빈 결과를 돌려 실시간 호출로 넘어가게 한다.
 */
export async function readStoredForecast(
  grid: GridKey,
  bases: CurrentBases,
): Promise<Partial<Record<ForecastKind, KmaItem[]>>> {
  try {
    const { data, error } = await getSupabaseAdminClient()
      .from(TABLE)
      .select("kind, payload")
      .eq("nx", grid.nx)
      .eq("ny", grid.ny)
      .or(basesFilter(bases));
    if (error) return {};

    const found: Partial<Record<ForecastKind, KmaItem[]>> = {};
    for (const row of (data ?? []) as { kind: ForecastKind; payload: unknown }[]) {
      if (FORECAST_KINDS.includes(row.kind) && Array.isArray(row.payload)) {
        found[row.kind] = row.payload as KmaItem[];
      }
    }
    return found;
  } catch {
    return {};
  }
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

/** 사용자 조회가 실시간으로 받은 값을 채운다. 응답을 막지 않고, 실패해도 던지지 않는다. */
export function saveForecastInBackground(rows: ForecastRow[]): void {
  const pending = saveForecast(rows).catch((err: unknown) => {
    console.warn("[kma-forecast] 저장을 건너뜁니다:", err instanceof Error ? err.message : "알 수 없음");
  });
  keepAlive(pending);
}
