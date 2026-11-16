"use client";

import { create } from "zustand";

export interface JumpTarget {
  date: string;
  cellId: string | null;
}

export interface ScheduleJumpState {
  target: JumpTarget | null;
  request: (target: JumpTarget) => void;
  consume: () => JumpTarget | null;
}

/** 미완료 목록 등에서 시설일정 특정 날짜·칸으로 한 번 이동하기 위한 비영속 스토어. */
export const useScheduleJumpStore = create<ScheduleJumpState>((set, get) => ({
  target: null,
  request: (target) => set({ target }),
  consume: () => {
    const current = get().target;
    if (!current) return null;
    set({ target: null });
    return current;
  },
}));
