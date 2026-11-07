import type { RefSource } from "@/features/schedule/lib/day-types";

export interface RefSourceSummary {
  erp: number;
  archive: number;
  marker: number;
  /** 어느 층에서도 참조 값을 못 찾은 행 */
  none: number;
  /** 공정관리가 아닌 행 전체(누적 + 마커 + 없음) */
  notErp: number;
}

/** 표 행의 참조 값 출처(`refSource`)를 층별로 센다. */
export function summarizeRefSources(rows: readonly { refSource: RefSource | null }[]): RefSourceSummary {
  const summary: RefSourceSummary = { erp: 0, archive: 0, marker: 0, none: 0, notErp: 0 };
  for (const { refSource } of rows) {
    if (refSource === null) summary.none += 1;
    else summary[refSource] += 1;
  }
  summary.notErp = summary.archive + summary.marker + summary.none;
  return summary;
}

/** 표 위 안내 글. 공정관리가 아닌 행이 없으면 `null`(안내를 보이지 않는다). */
export function formatRefNotice(summary: RefSourceSummary): string | null {
  if (summary.notErp === 0) return null;
  const parts = [
    summary.archive > 0 ? `누적 ${summary.archive}건` : "",
    summary.marker > 0 ? `마커 ${summary.marker}건` : "",
    summary.none > 0 ? `없음 ${summary.none}건` : "",
  ].filter((part) => part !== "");
  return `공정관리 정보가 없는 국소 ${summary.notErp}건 (${parts.join(" · ")})`;
}
