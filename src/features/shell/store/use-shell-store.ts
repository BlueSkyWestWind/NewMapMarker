import { create } from "zustand";
import type { SheetSnap } from "@/features/shell/lib/sheet-snap";

/** 패널 드릴다운 단계 */
export type PanelStep = "root" | "detail";

interface ShellState {
  isTreeOpen: boolean;
  setTreeOpen: (open: boolean) => void;
  panelStep: PanelStep;
  setPanelStep: (step: PanelStep) => void;
  sheetSnap: SheetSnap;
  setSheetSnap: (snap: SheetSnap) => void;
  /** 모바일 더보기 목록을 보고 있는지 */
  isMoreOpen: boolean;
  setMoreOpen: (open: boolean) => void;
}

/**
 * 셸 화면 상태. persist 하지 않는다 — 서버 렌더와 첫 렌더가 같은 값이라
 * 하이드레이션 경계를 늘리지 않고, 첫 화면은 항상 레일과 낮은 시트로 시작한다.
 */
export const useShellStore = create<ShellState>((set) => ({
  isTreeOpen: false,
  setTreeOpen: (isTreeOpen) => set({ isTreeOpen }),
  panelStep: "root",
  setPanelStep: (panelStep) => set({ panelStep }),
  sheetSnap: "peek",
  setSheetSnap: (sheetSnap) => set({ sheetSnap }),
  isMoreOpen: false,
  setMoreOpen: (isMoreOpen) => set({ isMoreOpen }),
}));
