import "server-only";
import { GRIDS_PER_SLICE } from "@/features/worksite-weather/constants/kma-prefetch";
import {
  fetchUltraSrtFcst,
  fetchUltraSrtNcst,
  fetchVilageFcst,
  KmaError,
} from "@/features/worksite-weather/lib/kma-client";
import { listStoredKeys, saveForecast, type ForecastRow } from "@/features/worksite-weather/lib/kma-forecast-store";
import { toKstParts } from "@/features/worksite-weather/lib/kma-base-time";
import {
  currentBases,
  isPrefetchWindow,
  pickGridsToFetch,
  uniqueGrids,
  type CurrentBases,
  type ForecastKind,
  type GridKey,
  type StoredKey,
} from "@/features/worksite-weather/lib/kma-prefetch-plan";
import type { KmaItem } from "@/features/worksite-weather/lib/merge-sources";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export interface SliceDeps {
  listMarkerPoints(): Promise<{ lat: number | null; lng: number | null }[]>;
  listStoredKeys(bases: CurrentBases): Promise<StoredKey[]>;
  fetchKind(kind: ForecastKind, grid: GridKey, bases: CurrentBases): Promise<KmaItem[]>;
  save(rows: ForecastRow[]): Promise<void>;
}

export interface SliceResult {
  status: "done" | "skipped" | "aborted";
  reason?: "outside-window" | "quota" | "auth" | "store-error";
  /** 이번 조각에서 처리한 격자 수 */
  grids: number;
  /** 저장 대상이 된 (격자, kind) 수 */
  fetched: number;
  /** 일부라도 실패한 격자 수 */
  failed: number;
  /** 이번 조각 뒤에도 빠진 것이 남은 격자 수 */
  remaining: number;
}

const ABORT_QUOTA = new Set(["22"]);
const ABORT_AUTH = new Set(["401", "403"]);

/** 조각 시각으로 시작 위치를 돌린다. 계속 실패하는 격자가 앞자리를 차지해 다른 격자를 굶기지 않게 한다. */
function rotate<T>(list: T[], slice: number): T[] {
  if (list.length === 0) return list;
  const offset = (slice * GRIDS_PER_SLICE) % list.length;
  return [...list.slice(offset), ...list.slice(0, offset)];
}

/**
 * 사전 수집 한 조각. 멱등이다: 이미 저장된 것은 받지 않고, 빠진 격자 최대 `GRIDS_PER_SLICE`개만 받는다.
 * 한 시간 안에 여러 번 불려도 기상청 호출은 늘지 않는다.
 */
export async function runPrefetchSlice(deps: SliceDeps, now: Date): Promise<SliceResult> {
  const empty: SliceResult = { status: "done", grids: 0, fetched: 0, failed: 0, remaining: 0 };
  if (!isPrefetchWindow(now)) return { ...empty, status: "skipped", reason: "outside-window" };

  const bases = currentBases(now);

  let needed: ReturnType<typeof pickGridsToFetch>;
  try {
    const points = await deps.listMarkerPoints();
    const stored = await deps.listStoredKeys(bases);
    needed = pickGridsToFetch(uniqueGrids(points), stored, Number.POSITIVE_INFINITY);
  } catch {
    // 저장 상태를 모르면 "전부 비어 있다"고 가정해 다시 받지 않는다
    return { ...empty, status: "aborted", reason: "store-error" };
  }

  const sliceIndex = Math.floor(toKstParts(now).minute / 2);
  const batch = rotate(needed, sliceIndex).slice(0, GRIDS_PER_SLICE);

  const rows: ForecastRow[] = [];
  let processed = 0;
  let failed = 0;
  let succeeded = 0;
  let abortReason: "quota" | "auth" | null = null;

  for (const grid of batch) {
    processed += 1;
    const settled = await Promise.allSettled(
      grid.kinds.map((kind) => deps.fetchKind(kind, { nx: grid.nx, ny: grid.ny }, bases)),
    );

    let gridFailed = false;
    settled.forEach((outcome, index) => {
      const kind = grid.kinds[index];
      if (outcome.status === "fulfilled") {
        // 빈 응답은 저장하지 않는다(한 시간 내내 "없음"을 진실로 두지 않기 위해)
        if (outcome.value.length > 0) {
          rows.push({
            nx: grid.nx,
            ny: grid.ny,
            kind,
            baseDate: bases[kind].baseDate,
            baseTime: bases[kind].baseTime,
            items: outcome.value,
            source: "prefetch",
          });
        }
        return;
      }
      gridFailed = true;
      const code = outcome.reason instanceof KmaError ? outcome.reason.code : "error";
      if (ABORT_QUOTA.has(code)) abortReason = "quota";
      else if (ABORT_AUTH.has(code)) abortReason = "auth";
    });

    if (gridFailed) failed += 1;
    else succeeded += 1;
    if (abortReason) break;
  }

  try {
    if (rows.length > 0) await deps.save(rows);
  } catch {
    return {
      status: "aborted",
      reason: "store-error",
      grids: processed,
      fetched: 0,
      failed,
      remaining: needed.length - succeeded,
    };
  }

  const remaining = needed.length - succeeded;
  if (abortReason) {
    return { status: "aborted", reason: abortReason, grids: processed, fetched: rows.length, failed, remaining };
  }
  return { status: "done", grids: processed, fetched: rows.length, failed, remaining };
}

const MARKER_PAGE_SIZE = 1000;

async function listMarkerPoints(): Promise<{ lat: number | null; lng: number | null }[]> {
  const points: { lat: number | null; lng: number | null }[] = [];
  for (let from = 0; ; from += MARKER_PAGE_SIZE) {
    const { data, error } = await getSupabaseAdminClient()
      .from("markers")
      .select("lat, lng")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .order("id")
      .range(from, from + MARKER_PAGE_SIZE - 1);
    if (error) throw new Error("마커 좌표를 읽지 못했습니다.");

    const page = (data ?? []) as { lat: number | null; lng: number | null }[];
    points.push(...page);
    if (page.length < MARKER_PAGE_SIZE) return points;
  }
}

/** 실제 환경용 구현. 기상청 호출은 `source: "prefetch"`로 집계된다. */
export function defaultSliceDeps(): SliceDeps {
  return {
    listMarkerPoints,
    listStoredKeys,
    save: saveForecast,
    fetchKind: (kind, grid, bases) => {
      const opts = { source: "prefetch" as const };
      if (kind === "vilage") return fetchVilageFcst({ ...grid, base: bases.vilage }, opts);
      if (kind === "ncst") return fetchUltraSrtNcst({ ...grid, base: bases.ncst }, opts);
      return fetchUltraSrtFcst({ ...grid, base: bases.ufcst }, opts);
    },
  };
}
