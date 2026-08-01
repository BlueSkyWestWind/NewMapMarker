import type {
  MapMode,
  MarkerFilterState,
  MarkerRecord,
} from "@/features/map-marker/types/marker";

/**
 * 패널이 공통으로 받는 데이터. `useActiveMarkers()`의 결과를 그대로 내린다.
 *
 * 각 패널이 직접 훅을 부르지 않는 이유: 그 훅은 `useRef`로 이전 필터 옵션을 기억하며
 * `useEffect`가 스토어에 쓴다. 두 곳에서 부르면 서로 다른 ref로 같은 필터를 번갈아 덮어쓴다.
 */
export interface PanelDataProps {
  mode: MapMode;
  markers: MarkerRecord[];
  filterOptions: {
    years: string[];
    businesses: string[];
    colors: string[];
    tags: string[];
  };
  filters: MarkerFilterState;
}
