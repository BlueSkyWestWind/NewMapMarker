const DIR16 = [
  "북", "북북동", "북동", "동북동",
  "동", "동남동", "남동", "남남동",
  "남", "남남서", "남서", "서남서",
  "서", "서북서", "북서", "북북서",
] as const;

/**
 * 풍향 각도(VEC, deg) → 16방위 — 기상청 변환식.
 * 음수·360 초과가 들어와도 한 바퀴로 정규화한다.
 */
export function windDirection(vec: number | null | undefined): string {
  if (vec === null || vec === undefined || !Number.isFinite(vec)) return "-";
  const normalized = ((vec % 360) + 360) % 360;
  return DIR16[Math.floor((normalized + 11.25) / 22.5) % 16];
}

/** 풍속 → 체감 등급(표시용). 작업 판정은 thresholds.ts 기준으로 따로 한다. */
export function windLabel(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "-";
  if (ms < 4) return "약함";
  if (ms < 9) return "약간 강함";
  if (ms < 14) return "강함";
  return "매우 강함";
}
