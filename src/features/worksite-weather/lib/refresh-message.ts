import type { RefreshSummary } from "@/features/worksite-weather/lib/worksite-weather-api";

/** [현재 데이터로 갱신]이 끝난 뒤 보여 줄 한 줄 결과 */
export function formatRefreshSummary(summary: RefreshSummary): string {
  const parts: string[] = [summary.refreshed > 0 ? `${summary.refreshed}곳 갱신` : "새로 받은 곳 없음"];
  if (summary.recent > 0) parts.push(`${summary.recent}곳은 5분 안에 갱신돼 건너뜀`);
  if (summary.failed > 0) parts.push(`${summary.failed}곳은 받지 못함`);
  if (summary.unsaved > 0) parts.push(`${summary.unsaved}곳은 저장하지 못해 이전 값이 보입니다`);
  if (!summary.alertsRefreshed) parts.push("특보는 새로 받지 못함");
  return parts.join(", ");
}
