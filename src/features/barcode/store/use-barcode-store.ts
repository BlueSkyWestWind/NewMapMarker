import { create } from "zustand";
import { parseLines } from "@/features/barcode/lib/parse-lines";
import type { LightboxTarget } from "@/features/barcode/types/barcode";

interface BarcodeState {
  draftValue: string;
  items: string[];
  size: number;
  thumbnails: Record<string, string>;
  lightboxTarget: LightboxTarget | null;

  setDraftValue: (value: string) => void;
  setSize: (size: number) => void;
  /** 원본처럼 입력만으로는 갱신하지 않는다 — 클릭(또는 Ctrl/Cmd+Enter)해야 반영된다. */
  generate: () => void;
  clearAll: () => void;
  /** 사진 인식·엑셀 후보 사용은 원본처럼 입력창에 즉시 추가하고 바로 재생성한다. */
  appendAndGenerate: (lines: string[]) => void;
  mergeThumbnails: (thumbnails: Record<string, string>) => void;
  setLightboxTarget: (target: LightboxTarget | null) => void;
}

/**
 * 바코드/QR 상태를 zustand로 뺀 이유: 입력·엑셀검색은 사이드바(`BarcodePanel`)에,
 * 결과 QR 그리드는 지도가 있던 메인 영역(`BarcodeResultsMain`)에 각각 떠서
 * 두 컴포넌트가 형제 트리다 — props로는 못 넘기고 공유 상태가 필요하다.
 * `route` 기능(지도 위 경로 표시 ↔ 사이드바 컨트롤)과 같은 이유의 같은 패턴이다.
 */
export const useBarcodeStore = create<BarcodeState>()((set) => ({
  draftValue: "",
  items: [],
  size: 120,
  thumbnails: {},
  lightboxTarget: null,

  setDraftValue: (value) => set({ draftValue: value }),
  setSize: (size) => set({ size }),

  generate: () => set((state) => ({ items: parseLines(state.draftValue) })),

  clearAll: () => set({ draftValue: "", items: [] }),

  appendAndGenerate: (lines) =>
    set((state) => {
      const next = [state.draftValue, lines.join("\n")]
        .filter((part) => part.trim() !== "")
        .join("\n");
      return { draftValue: next, items: parseLines(next) };
    }),

  mergeThumbnails: (thumbnails) =>
    set((state) => ({ thumbnails: { ...state.thumbnails, ...thumbnails } })),

  setLightboxTarget: (target) => set({ lightboxTarget: target }),
}));
