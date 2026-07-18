/**
 * 지도 다중 캡처 → 한 장 이어붙이기
 *
 * 격자 중심은 lat/lng 산술이 아니라 화면(투영) 픽셀 간격으로 잡는다.
 * 합성 dest는 촬영 직후 실제 지도 중심을 다시 투영해 보정한다.
 */

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

export interface MapBoundsLiteral {
  sw: LatLngLiteral;
  ne: LatLngLiteral;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface CaptureTilePlan {
  /** 행(위에서 아래) */
  row: number;
  /** 열(왼쪽에서 오른쪽) */
  col: number;
  /** 이 타일을 찍을 때 지도 중심 */
  center: LatLngLiteral;
  /** 합성 결과 이미지에서의 좌상단 x(px) */
  destX: number;
  /** 합성 결과 이미지에서의 좌상단 y(px) */
  destY: number;
}

export interface CaptureGridPlan {
  rows: number;
  cols: number;
  tileWidth: number;
  tileHeight: number;
  /** 좌/우에서 잘라낼 겹침 픽셀 */
  overlapX: number;
  /** 상/하에서 잘라낼 겹침 픽셀 */
  overlapY: number;
  /** 최종 이미지 크기 */
  outputWidth: number;
  outputHeight: number;
  /** 이 격자가 촬영될 지도 레벨 (가이드가 화면 셀 크기를 정밀 계산하는 데 사용) */
  captureLevel?: number;
  tiles: CaptureTilePlan[];
}

export interface BuildCaptureGridOptions {
  bounds: MapBoundsLiteral;
  viewportSize: ViewportSize;
  /**
   * 인접 타일과 겹치는 비율 (0~0.4 권장)
   * 예: 0.05 = 5% 겹침 → 이음새 오차·타일 로딩 경계 완화
   */
  overlapRatio?: number;
  /** 격자 안전 여유 (bounds 바깥으로 조금 더 커버) */
  paddingRatio?: number;
  /**
   * 있으면 화면 투영 기준으로 격자를 만든다. (정렬 정확도↑)
   * 없을 때만 viewportSpan 폴백을 쓴다.
   */
  map?: KakaoMap;
  /**
   * 격자를 만들 목표 지도 레벨. map과 함께 주면 지도를 실제로 줌하지 않고도
   * 목표 레벨의 화면 픽셀 기준으로 정밀 계산한다. (없으면 현재 map 레벨)
   */
  captureLevel?: number;
  /** map 없을 때 폴백: 현재 줌에서 화면 1칸이 커버하는 위도/경도 폭 */
  viewportSpan?: {
    latSpan: number;
    lngSpan: number;
  };
}

export const DEFAULT_OVERLAP_RATIO = 0.05;

export const DEFAULT_PADDING_RATIO = 0.05;

/** 타일이 너무 많으면 미리보기에서 경고 */
export const MAX_RECOMMENDED_CAPTURE_TILES = 36;

export interface CapturedTileImage {
  row: number;
  col: number;
  canvas: HTMLCanvasElement;
}

export interface GridCaptureResult {
  stitched: HTMLCanvasElement;
  tiles: CapturedTileImage[];
  plan: CaptureGridPlan;
}
