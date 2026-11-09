import {
  PREFETCH_FIRST_HOUR,
  PREFETCH_LAST_HOUR,
} from "@/features/worksite-weather/constants/kma-prefetch";
import { isGridInKorea, toGrid } from "@/features/worksite-weather/lib/grid";
import {
  getUltraFcstBase,
  getUltraNcstBase,
  getVilageBaseForToday,
  toKstParts,
  type KmaBase,
} from "@/features/worksite-weather/lib/kma-base-time";

/**
 * 사전 수집 계획용 순수 함수. 서버·테스트 모두에서 쓰므로 `server-only`를 쓰지 않는다.
 */

export type ForecastKind = "vilage" | "ncst" | "ufcst";

export const FORECAST_KINDS: readonly ForecastKind[] = ["vilage", "ncst", "ufcst"];

export interface GridKey {
  nx: number;
  ny: number;
}

export interface StoredKey extends GridKey {
  kind: ForecastKind;
}

export interface CurrentBases {
  vilage: KmaBase;
  ncst: KmaBase;
  ufcst: KmaBase;
}

/** 지금 이 순간 화면이 실시간으로 계산할 기준시각 세 종류. 저장분은 이것과 같을 때만 쓴다. */
export function currentBases(now: Date): CurrentBases {
  return {
    vilage: getVilageBaseForToday(now),
    ncst: getUltraNcstBase(now),
    ufcst: getUltraFcstBase(now),
  };
}

/** KST 07시~17시(17:59까지)인가 */
export function isPrefetchWindow(now: Date): boolean {
  const { hour } = toKstParts(now);
  return hour >= PREFETCH_FIRST_HOUR && hour <= PREFETCH_LAST_HOUR;
}

/** 좌표 목록 → 기상청 격자 목록(국내만, 중복 제거, nx·ny 오름차순) */
export function uniqueGrids(points: { lat: number | null; lng: number | null }[]): GridKey[] {
  const seen = new Map<string, GridKey>();
  for (const point of points) {
    const { lat, lng } = point;
    if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const grid = toGrid(lat, lng);
    if (!isGridInKorea(grid)) continue;
    seen.set(`${grid.nx}:${grid.ny}`, { nx: grid.nx, ny: grid.ny });
  }
  return [...seen.values()].sort((a, b) => a.nx - b.nx || a.ny - b.ny);
}

/**
 * 세 kind 중 하나라도 저장되지 않은 격자를 입력 순서대로 `limit`개 고른다.
 * `kinds`에는 빠진 것만 담는다.
 */
export function pickGridsToFetch(
  grids: GridKey[],
  stored: StoredKey[],
  limit: number,
): { nx: number; ny: number; kinds: ForecastKind[] }[] {
  const have = new Set(stored.map((key) => `${key.nx}:${key.ny}:${key.kind}`));
  const picked: { nx: number; ny: number; kinds: ForecastKind[] }[] = [];

  for (const grid of grids) {
    if (picked.length >= limit) break;
    const kinds = FORECAST_KINDS.filter((kind) => !have.has(`${grid.nx}:${grid.ny}:${kind}`));
    if (kinds.length > 0) picked.push({ nx: grid.nx, ny: grid.ny, kinds });
  }
  return picked;
}

/**
 * 수집 라우트 토큰 검사. 문자열 길이·내용과 무관하게 끝까지 비교해 응답 시간으로 값을 추측하지 못하게 한다.
 * 서버 토큰이 없거나 비어 있으면 항상 거부한다(미설정 상태로 열리지 않도록).
 */
export function isPrefetchTokenValid(provided: string | null, expected: string | undefined): boolean {
  if (!expected || provided === null) return false;

  const length = Math.max(provided.length, expected.length);
  let diff = provided.length ^ expected.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (provided.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
}
