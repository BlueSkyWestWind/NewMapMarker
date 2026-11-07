import type { DayRow } from "@/features/schedule/lib/day-rows";
import type { ArchiveRow, DayDetailPatch, DayValues } from "@/features/schedule/lib/day-types";

/** 누적 검색용 글: 국소명·프로젝트·통합시설코드를 공백으로 이은 소문자. */
export function archiveSearchText(values: DayValues): string {
  return [values.site, values.project, values.facilityCode].join(" ").toLowerCase();
}

/** 그날의 표 행을 누적 행으로 바꾼다. `values`는 복사해 원본과 떼어 둔다. */
export function rowsToArchive(workDate: string, rows: readonly DayRow[], savedAt: string): ArchiveRow[] {
  return rows.map((row) => ({
    workDate,
    stationKey: row.stationKey,
    site: row.site,
    values: { ...row.values },
    savedAt,
  }));
}

/** 국소(`stationKey`)마다 `workDate`가 가장 큰 행만 남긴다. */
export function latestPerStation(rows: readonly ArchiveRow[]): Map<string, ArchiveRow> {
  const latest = new Map<string, ArchiveRow>();
  for (const row of rows) {
    const current = latest.get(row.stationKey);
    if (!current || row.workDate > current.workDate) latest.set(row.stationKey, row);
  }
  return latest;
}

/** 이전 누적에서 이어받을 입력 열(작업시간·작업유형·중장비투입·작업내용·작업내용 상세) 중 비어 있지 않은 것만 고른다. */
export function pickPreviousInput(row: ArchiveRow | undefined): DayDetailPatch {
  if (!row) return {};
  const { workTime, workType, equipment, workContent, workDetail } = row.values;
  const patch: DayDetailPatch = {};
  if (workTime) patch.workTime = workTime;
  if (workType) patch.workType = workType;
  if (equipment) patch.equipment = equipment;
  if (workContent) patch.workContent = workContent;
  if (workDetail) patch.workDetail = workDetail;
  return patch;
}
