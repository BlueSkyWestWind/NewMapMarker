import type { NavKey } from "@/features/shell/types/nav";

/** 모바일 하단 시트의 높이 단계 */
export type SheetSnap = "peek" | "half" | "full";

/** 손잡이와 제목만 보이는 높이 */
export const SHEET_PEEK_PX = 76;
/** 전체 높이에서도 위쪽에 남겨 시트임을 알 수 있게 하는 틈 */
export const SHEET_FULL_GAP_PX = 8;

const SNAPS: SheetSnap[] = ["peek", "half", "full"];

/** `areaPx`는 지도 영역(시트가 올라오는 공간)의 높이다. */
export function sheetHeightPx(snap: SheetSnap, areaPx: number): number {
  if (snap === "peek") return SHEET_PEEK_PX;
  if (snap === "half") return Math.round(areaPx / 2);
  return areaPx - SHEET_FULL_GAP_PX;
}

/** 손잡이를 놓은 높이에서 가장 가까운 단계 */
export function nearestSheetSnap(heightPx: number, areaPx: number): SheetSnap {
  return SNAPS.reduce((best, snap) =>
    Math.abs(sheetHeightPx(snap, areaPx) - heightPx) <
    Math.abs(sheetHeightPx(best, areaPx) - heightPx)
      ? snap
      : best,
  );
}

/** 손잡이를 눌렀을 때의 다음 단계 */
export function nextSheetSnap(current: SheetSnap): SheetSnap {
  return SNAPS[(SNAPS.indexOf(current) + 1) % SNAPS.length];
}

/** 하단 메뉴를 눌렀을 때의 높이 */
export function sheetSnapOnNavigate(params: {
  nav: NavKey;
  isSameTab: boolean;
  current: SheetSnap;
}): SheetSnap {
  if (params.isSameTab) return params.current === "peek" ? "half" : "peek";
  // 지도가 없는 화면이라 낮출 이유가 없다.
  return params.nav === "barcode" ? "full" : "half";
}
