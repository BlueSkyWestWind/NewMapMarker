/**
 * 격자 구성(레벨·겹침·범위)이 바뀌어 타일 수가 달라지면 제외 선택을 초기화하고,
 * 타일 수가 같으면 기존 제외 Set을 그대로 유지한다.
 */
export function nextExcludedTiles(
  prevTileCount: number,
  nextTileCount: number,
  excluded: Set<number>,
): Set<number> {
  if (nextTileCount !== prevTileCount) {
    return new Set();
  }
  return excluded;
}
