/**
 * 대시보드를 열었을 때 오늘의 작업 국소의 마커창을 자동으로 펼치는 계산(순수 함수).
 *
 * 이미 한 번 펼쳐 본 국소(`opened`)는 사용자가 직접 닫았을 수 있으므로 다시 펼치지 않고,
 * 새로 생긴 국소(시설일정 자동 등록 등)만 펼친다. 작업 국소가 아닌 다른 선택은 그대로 둔다.
 */
export interface AutoOpenPlan {
  /** 반영할 선택(마커창이 열리는 국소) */
  selected: string[];
  /** 펼쳐 본 국소(다음 계산에서 다시 펼치지 않는다) */
  opened: string[];
  /** 지도를 맞출 국소: 작업 국소 전체 */
  fitIds: string[];
}

export function planAutoOpen(input: {
  allIds: string[];
  opened: string[];
  selected: string[];
}): AutoOpenPlan | null {
  const alreadyOpened = new Set(input.opened);
  const fresh = input.allIds.filter((id) => !alreadyOpened.has(id));
  if (fresh.length === 0) return null;

  const selectedSet = new Set(input.selected);
  return {
    selected: [...input.selected, ...fresh.filter((id) => !selectedSet.has(id))],
    opened: [...input.opened, ...fresh],
    fitIds: input.allIds,
  };
}
