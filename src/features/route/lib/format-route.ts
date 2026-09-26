/** m → "1.2km" / "850m". */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)}km`;
  }
  return `${Math.round(meters)}m`;
}

/** sec → "1시간 39분" / "39분" / "0분". */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}분`;
  return `${hours}시간 ${minutes}분`;
}

/** 원 단위 통행료 → "5,000원" / "무료". */
export function formatToll(won: number): string {
  if (won <= 0) return "무료";
  return `${won.toLocaleString("ko-KR")}원`;
}
