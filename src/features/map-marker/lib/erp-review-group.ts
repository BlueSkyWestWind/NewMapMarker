import {
  buildSplitGroupKey,
  getLotAddressKey,
  GROUP_ROLE_REPRESENTATIVE,
  GROUP_ROLE_SUB,
} from "@/features/map-marker/lib/address-group";
import type { StagedErpRow } from "@/features/map-marker/types/marker";

/**
 * 위치등록 확인 목록에서 같은 지번의 여러 단지를 대표·SUB 그룹으로 직접 묶는다.
 * 그룹 값(`group_key`·`group_role`)을 마커 행에 실어 두면 [확인] 때 함께 저장되고,
 * 저장 뒤 재정리가 이 키를 우선해 `parent_marker_id`를 맞춘다.
 */

const clearGroup = (row: StagedErpRow): StagedErpRow => {
  if (!row.group) return row;
  const { group: _group, ...rest } = row;
  const { group_key: _key, group_role: _role, ...marker } = row.marker;
  return { ...rest, marker };
};

/** 선택한 행이 속한 그룹을 통째로 푼다(남은 구성원이 대표 없이 남지 않게). */
export function ungroupReviewRows(rows: StagedErpRow[], ids: string[]): StagedErpRow[] {
  const keys = new Set(
    rows.filter((row) => ids.includes(row.id) && row.group).map((row) => row.group!.key),
  );
  if (keys.size === 0) return rows;
  return rows.map((row) => (row.group && keys.has(row.group.key) ? clearGroup(row) : row));
}

/**
 * 선택한 행(`ids`)을 하나의 그룹으로 묶는다. `repId`가 대표, 나머지는 SUB다.
 * 선택이 2건 미만이거나 대표가 선택에 없으면 그대로 돌려준다.
 */
export function groupReviewRows(
  rows: StagedErpRow[],
  ids: string[],
  repId: string,
): StagedErpRow[] {
  const members = new Set(ids);
  const rep = rows.find((row) => row.id === repId);
  if (!rep || !members.has(repId) || members.size < 2) return rows;

  const key = buildSplitGroupKey(getLotAddressKey(rep.address) || "lot", "묶음", repId);
  return ungroupReviewRows(rows, ids).map((row) => {
    if (!members.has(row.id)) return row;
    const role = row.id === repId ? GROUP_ROLE_REPRESENTATIVE : GROUP_ROLE_SUB;
    return {
      ...row,
      group: { key, role },
      marker: { ...row.marker, group_key: key, group_role: role },
    };
  });
}

/** 그룹 키마다 목록 행 순서대로 1부터 번호를 매긴다(화면의 그룹 표시용). */
export function reviewGroupNumbers(rows: StagedErpRow[]): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const row of rows) {
    if (row.group && !numbers.has(row.group.key)) numbers.set(row.group.key, numbers.size + 1);
  }
  return numbers;
}
