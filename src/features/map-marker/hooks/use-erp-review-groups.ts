import { useState } from "react";
import {
  groupReviewRows,
  reviewGroupNumbers,
  ungroupReviewRows,
} from "@/features/map-marker/lib/erp-review-group";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import type { StagedErpRow, StagedErpUpload } from "@/features/map-marker/types/marker";

/** 묶음 번호마다 띠 색을 돌려 쓴다 */
const GROUP_BAR_CLASSES = [
  "border-sky-400",
  "border-emerald-400",
  "border-violet-400",
  "border-rose-400",
  "border-lime-400",
  "border-orange-400",
];

/**
 * 위치등록 확인 목록의 체크·대표 선택과 그룹 묶기·해제.
 * 사이드바 패널과 큰 창이 같은 선택 상태를 보도록 한 곳에서 관리한다.
 */
export function useErpReviewGroups(upload: StagedErpUpload) {
  const setStagedErpUpload = useMapMarkerStore((state) => state.setStagedErpUpload);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [repId, setRepId] = useState<string | null>(null);
  const rows = upload.reviewRows;

  // 저장·제외로 목록에서 빠진 행은 선택에서도 뺀다.
  const checkedIds = rows.filter((row) => checked.has(row.id)).map((row) => row.id);
  const activeRepId = repId && checkedIds.includes(repId) ? repId : null;
  const groupNumbers = reviewGroupNumbers(rows);
  const hasCheckedGroup = rows.some((row) => row.group && checked.has(row.id));

  const toggleChecked = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = (on: boolean) =>
    setChecked(on ? new Set(rows.map((row) => row.id)) : new Set());
  const apply = (next: StagedErpRow[]) => {
    setStagedErpUpload({ ...upload, reviewRows: next });
    setChecked(new Set());
    setRepId(null);
  };

  return {
    checked,
    checkedIds,
    activeRepId,
    setRepId,
    groupNumbers,
    hasCheckedGroup,
    toggleChecked,
    toggleAll,
    group: () => {
      if (activeRepId) apply(groupReviewRows(rows, checkedIds, activeRepId));
    },
    ungroup: () => apply(ungroupReviewRows(rows, checkedIds)),
    barClassOf: (row: StagedErpRow) =>
      row.group
        ? GROUP_BAR_CLASSES[((groupNumbers.get(row.group.key) ?? 1) - 1) % GROUP_BAR_CLASSES.length]
        : "border-transparent",
  };
}

export type ErpReviewGroups = ReturnType<typeof useErpReviewGroups>;
