import type { FacilityRecord } from "@/features/map-marker/types/marker";
import { normalize } from "@/features/worksite-weather/lib/site-search";

/**
 * 시설일정 `미배정 국소`: 시설일이 없고 오늘 이후 일정에도 없는 장비 국소를 찾는 계산(순수 함수).
 * 지난 날짜에만 있는 국소는 일정에 없는 것으로 본다.
 */

export interface UnscheduledSource {
  id: string;
  name: string;
  finalStationName?: string | null;
  roadAddress?: string | null;
  jibunAddress?: string | null;
  siteAlias?: string | null;
  facilityCode?: string | null;
  projectCode?: string | null;
  businessType?: string | null;
  eqType?: string | null;
  installDate?: string | null;
  facilityRecords?: FacilityRecord[];
  /** 값이 있으면 대표의 SUB 마커 */
  parentMarkerId?: string | null;
}

export interface UnscheduledStation {
  id: string;
  /** 일정 칸에 넣을 국소명(국소 검색으로 추가할 때와 같은 이름) */
  label: string;
  address: string;
  facilityCode: string;
  projectCode: string;
  /** 사업구분 */
  businessType: string;
  /** 장비최종 */
  eqType: string;
}

/** 마커 자신과 모든 장비 기록의 시설일이 비어 있다. */
export function hasNoInstallDate(marker: UnscheduledSource): boolean {
  if ((marker.installDate ?? "").trim() !== "") return false;
  return (marker.facilityRecords ?? []).every((record) => (record.installDate ?? "").trim() === "");
}

/** 일정 글과 대조하는 이름들: 국소명·최종 국소명·별칭 */
function nameKeys(marker: UnscheduledSource): string[] {
  const aliases = (marker.siteAlias ?? "").split(",");
  return [marker.name, marker.finalStationName ?? "", ...aliases].map((value) => normalize(value)).filter(Boolean);
}

/**
 * 시설일이 없고 일정에 없는 대표·단독 마커를 이름순으로 돌려준다.
 * `scheduledNames`는 오늘 이후 일정 칸의 `국소·작업` 글이다. 같은 국소명은 하나만 남긴다.
 */
export function findUnscheduledStations(
  markers: readonly UnscheduledSource[],
  scheduledNames: readonly string[],
): UnscheduledStation[] {
  const scheduled = new Set(scheduledNames.map((name) => normalize(name)).filter(Boolean));
  const seen = new Set<string>();
  const result: UnscheduledStation[] = [];
  for (const marker of markers) {
    if (marker.parentMarkerId) continue;
    const label = (marker.finalStationName || marker.name || "").trim();
    if (label === "" || seen.has(label)) continue;
    if (!hasNoInstallDate(marker)) continue;
    if (nameKeys(marker).some((key) => scheduled.has(key))) continue;
    seen.add(label);
    result.push({
      id: marker.id,
      label,
      address: (marker.roadAddress || marker.jibunAddress || "").trim(),
      facilityCode: (marker.facilityCode ?? "").trim(),
      projectCode: (marker.projectCode ?? "").trim(),
      businessType: (marker.businessType ?? "").trim(),
      eqType: (marker.eqType ?? "").trim(),
    });
  }
  return result.sort((a, b) => a.label.localeCompare(b.label, "ko"));
}

/**
 * 업체(협력사)가 `partner`와 같은 국소만 남긴다(원래 순서 유지). 앞뒤 공백은 무시하고 이름 전체가 같아야 한다.
 * 업체 정보가 없거나 비어 있는 국소는 어느 업체인지 알 수 없어 뺀다.
 */
export function filterByPartner<T extends { partner?: string }>(
  stations: readonly T[],
  partner: string,
): T[] {
  const wanted = partner.trim();
  return stations.filter((station) => (station.partner ?? "").trim() === wanted);
}

/** 칸에서 이미 쓰는 행 번호(`usedRows`) 다음부터 `count`개의 빈 행 번호. 행 수 상한(`maxRows`)을 넘기지 않는다. */
export function nextFreeRows(usedRows: readonly number[], count: number, maxRows: number): number[] {
  const start = usedRows.length === 0 ? 0 : Math.max(...usedRows) + 1;
  const rows: number[] = [];
  for (let row = start; rows.length < count && row < maxRows; row += 1) rows.push(row);
  return rows;
}
