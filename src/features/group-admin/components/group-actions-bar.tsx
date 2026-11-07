"use client";

import { Button } from "@/components/ui/button";

interface GroupActionsBarProps {
  selectedCount: number;
  /** 현재 묶음이 분리 묶음(group_key 있음)이라 번지 묶음으로 되돌릴 수 있는지. */
  canUnsplit: boolean;
  /** 왼쪽 목록에서 같이 합치려고 고른 다른 묶음 수. */
  mergePickCount: number;
  disabled: boolean;
  onRepresentative: () => void;
  onStandalone: () => void;
  onSeparate: () => void;
  onDelete: () => void;
  onMerge: () => void;
  onUnsplit: () => void;
}

const BTN = "h-7 shrink-0 whitespace-nowrap border-slate-700 px-2 text-xs text-slate-200";

/** 표에서 체크한 마커에 쓰는 정리 동작. 누르면 변경분에 쌓일 뿐 DB에는 쓰지 않는다. */
export function GroupActionsBar({
  selectedCount,
  canUnsplit,
  mergePickCount,
  disabled,
  onRepresentative,
  onStandalone,
  onSeparate,
  onDelete,
  onMerge,
  onUnsplit,
}: GroupActionsBarProps) {
  return (
    <div className="flex items-center gap-1.5 overflow-hidden px-1 pb-2">
      <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-400">
        선택 {selectedCount}건
      </span>
      <Button type="button" variant="outline" className={BTN} disabled={disabled || selectedCount !== 1} onClick={onRepresentative}>
        대표로 지정
      </Button>
      <Button type="button" variant="outline" className={BTN} disabled={disabled || selectedCount === 0} onClick={onStandalone}>
        단독으로
      </Button>
      <Button type="button" variant="outline" className={BTN} disabled={disabled || selectedCount === 0} onClick={onSeparate}>
        분리
      </Button>
      <Button type="button" variant="outline" className={BTN} disabled={disabled || mergePickCount === 0} onClick={onMerge}>
        합치기 (묶음 {mergePickCount + 1}개)
      </Button>
      {canUnsplit ? (
        <Button type="button" variant="outline" className={BTN} disabled={disabled} onClick={onUnsplit}>
          분리 해제
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className={`${BTN} border-rose-500/60 text-rose-200`}
        disabled={disabled || selectedCount === 0}
        onClick={onDelete}
      >
        삭제
      </Button>
    </div>
  );
}
