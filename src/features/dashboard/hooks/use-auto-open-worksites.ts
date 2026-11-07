"use client";

import { useEffect, useRef } from "react";
import { useMapMarkerStore } from "@/features/map-marker/store/use-map-marker-store";
import { planAutoOpen } from "../lib/auto-open-worksites";

/** 펼친 선택이 외부에서 되돌려졌는지 확인하는 대기 시간(ms) */
const REASSERT_DELAY_MS = 600;

/**
 * 대시보드를 열면 오늘의 작업 국소 전체의 마커창을 지도에 펼치고, 지도를 작업 국소가 모두 보이게 맞춘다.
 * 새로 담긴 국소(시설일정 자동 등록 등)는 열린 뒤에도 이어서 펼친다. 사용자가 직접 닫거나
 * `마커창 전체 숨김`으로 끈 국소는 다시 펼치지 않는다(펼쳐 본 국소를 이 대시보드가 열려 있는 동안 기억한다).
 *
 * 렌더마다 가볍게 계산하고, 펼칠 국소가 있을 때만 저장소에 쓴다(deps 없는 effect).
 * 대시보드의 마커창 선택은 이 훅이 맡는다(예전의 "첫 행만 선택" effect는 없앴다).
 */
export function useAutoOpenWorksites(siteIds: string[]) {
  const openedRef = useRef<string[]>([]);

  // 대시보드가 떠 있는 동안만 정보창을 가장자리 열에 유지한다(확대·축소해도 다시 배치). Strict Mode의 재마운트에도 켜진다.
  useEffect(() => {
    useMapMarkerStore.getState().setOverlayBoardActive(true);
    return () => useMapMarkerStore.getState().setOverlayBoardActive(false);
  }, []);

  useEffect(() => {
    const store = useMapMarkerStore.getState();
    const openedBefore = openedRef.current;
    const plan = planAutoOpen({
      allIds: siteIds,
      opened: openedBefore,
      selected: store.selectedMarkerIds,
    });
    if (!plan) return;
    openedRef.current = plan.opened;
    store.setSelectedMarkerIds(plan.selected);
    store.requestMapFit(plan.fitIds, { arrange: true });

    // 지도·모드 전환이 막 펼친 선택을 곧바로 되돌리는 경우를 대비해, 새로 펼친 국소가 하나도 선택에 남아 있지
    // 않으면 한 번만 다시 적용한다. 사용자가 짧은 시간에 전부 직접 닫는 일은 없다고 본다.
    const fresh = siteIds.filter((id) => !openedBefore.includes(id));
    window.setTimeout(() => {
      const current = useMapMarkerStore.getState();
      if (fresh.some((id) => current.selectedMarkerIds.includes(id))) return;
      current.setSelectedMarkerIds([...current.selectedMarkerIds, ...fresh]);
    }, REASSERT_DELAY_MS);
  });
}
