import type {
  LatLngLiteral, MapBoundsLiteral, ViewportSize,
  CaptureTilePlan, CaptureGridPlan, BuildCaptureGridOptions,
  CapturedTileImage, GridCaptureResult,
} from "./types";
import {
  DEFAULT_OVERLAP_RATIO, DEFAULT_PADDING_RATIO, MAX_RECOMMENDED_CAPTURE_TILES,
} from "./types";
import { readPointXY, clamp, padBounds } from "./helpers";
import {
  getMarkerIdsInBounds, buildBoundsFromMarkers, measureViewportSpan,
  measurePixelOffsetBetween, screenRectToMapBounds, estimateSpanAtLevel,
} from "./bounds";


/**
 * 화면 투영 픽셀 간격으로 bounds 커버 격자를 만든다.
 */
function buildCaptureGridPlanFromProjection(
  map: KakaoMap,
  options: BuildCaptureGridOptions,
): CaptureGridPlan {
  const projection = map.getProjection();
  if (!projection) {
    throw new Error("지도 projection을 읽을 수 없습니다.");
  }

  const overlapRatio = clamp(
    options.overlapRatio ?? DEFAULT_OVERLAP_RATIO,
    0,
    0.4,
  );
  const paddingRatio = Math.max(
    0,
    options.paddingRatio ?? DEFAULT_PADDING_RATIO,
  );

  const { width: tileWidth, height: tileHeight } = options.viewportSize;
  const overlapX = Math.round(tileWidth * overlapRatio);
  const overlapY = Math.round(tileHeight * overlapRatio);
  const stepX = Math.max(1, tileWidth - overlapX);
  const stepY = Math.max(1, tileHeight - overlapY);

  const swContainer = readPointXY(
    projection.containerPointFromCoords(
      new window.kakao.maps.LatLng(
        options.bounds.sw.lat,
        options.bounds.sw.lng,
      ),
    ),
  );
  const neContainer = readPointXY(
    projection.containerPointFromCoords(
      new window.kakao.maps.LatLng(
        options.bounds.ne.lat,
        options.bounds.ne.lng,
      ),
    ),
  );

  let minX = Math.min(swContainer.x, neContainer.x);
  let maxX = Math.max(swContainer.x, neContainer.x);
  let minY = Math.min(swContainer.y, neContainer.y);
  let maxY = Math.max(swContainer.y, neContainer.y);

  const padX = (maxX - minX) * paddingRatio;
  const padY = (maxY - minY) * paddingRatio;
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;

  const regionWidth = Math.max(1, maxX - minX);
  const regionHeight = Math.max(1, maxY - minY);
  const regionCenterX = (minX + maxX) / 2;
  const regionCenterY = (minY + maxY) / 2;

  const cols = Math.max(1, Math.ceil((regionWidth - tileWidth) / stepX) + 1);
  const rows = Math.max(1, Math.ceil((regionHeight - tileHeight) / stepY) + 1);

  // 격자 전체 커버 영역을 선택 범위 중심에 맞춤 (좌상단 고정 → 우측 쏠림 방지)
  const coverageWidth = tileWidth + (cols - 1) * stepX;
  const coverageHeight = tileHeight + (rows - 1) * stepY;
  const originLeft = regionCenterX - coverageWidth / 2;
  const originTop = regionCenterY - coverageHeight / 2;

  const tiles: CaptureTilePlan[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const centerX = originLeft + tileWidth / 2 + col * stepX;
      const centerY = originTop + tileHeight / 2 + row * stepY;
      const centerLatLng = projection.coordsFromContainerPoint(
        new window.kakao.maps.Point(centerX, centerY),
      );

      tiles.push({
        row,
        col,
        center: {
          lat: centerLatLng.getLat(),
          lng: centerLatLng.getLng(),
        },
        destX: col * stepX,
        destY: row * stepY,
      });
    }
  }

  return {
    rows,
    cols,
    tileWidth,
    tileHeight,
    overlapX,
    overlapY,
    outputWidth: coverageWidth,
    outputHeight: coverageHeight,
    tiles,
  };
}


/**
 * lat/lng span 폴백 격자 (픽셀 step과 비율을 일치시킴)
 */
function buildCaptureGridPlanFromSpan(
  options: BuildCaptureGridOptions,
): CaptureGridPlan {
  const viewportSpan = options.viewportSpan;
  if (!viewportSpan) {
    throw new Error("map 또는 viewportSpan이 필요합니다.");
  }

  const overlapRatio = clamp(
    options.overlapRatio ?? DEFAULT_OVERLAP_RATIO,
    0,
    0.4,
  );
  const paddingRatio = Math.max(
    0,
    options.paddingRatio ?? DEFAULT_PADDING_RATIO,
  );

  const { width: tileWidth, height: tileHeight } = options.viewportSize;
  const overlapX = Math.round(tileWidth * overlapRatio);
  const overlapY = Math.round(tileHeight * overlapRatio);
  const stepX = Math.max(1, tileWidth - overlapX);
  const stepY = Math.max(1, tileHeight - overlapY);

  const { latSpan, lngSpan } = viewportSpan;
  if (latSpan <= 0 || lngSpan <= 0) {
    throw new Error("viewportSpan 값이 올바르지 않습니다.");
  }

  // 반올림된 step과 동일한 비율로 geo step을 맞춤
  const effectiveLatSpan = latSpan * (stepY / tileHeight);
  const effectiveLngSpan = lngSpan * (stepX / tileWidth);

  const padded = padBounds(options.bounds, paddingRatio);
  const totalLat = padded.ne.lat - padded.sw.lat;
  const totalLng = padded.ne.lng - padded.sw.lng;
  const regionCenterLat = (padded.sw.lat + padded.ne.lat) / 2;
  const regionCenterLng = (padded.sw.lng + padded.ne.lng) / 2;

  const cols = Math.max(
    1,
    Math.ceil((totalLng - lngSpan) / effectiveLngSpan) + 1,
  );
  const rows = Math.max(
    1,
    Math.ceil((totalLat - latSpan) / effectiveLatSpan) + 1,
  );

  // 격자 커버 범위를 선택 영역 중심에 맞춤
  const coverageLat = latSpan + (rows - 1) * effectiveLatSpan;
  const coverageLng = lngSpan + (cols - 1) * effectiveLngSpan;
  const originNorthLat = regionCenterLat + coverageLat / 2;
  const originWestLng = regionCenterLng - coverageLng / 2;

  const tiles: CaptureTilePlan[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const centerLat = originNorthLat - latSpan / 2 - row * effectiveLatSpan;
      const centerLng = originWestLng + lngSpan / 2 + col * effectiveLngSpan;

      tiles.push({
        row,
        col,
        center: { lat: centerLat, lng: centerLng },
        destX: col * stepX,
        destY: row * stepY,
      });
    }
  }

  return {
    rows,
    cols,
    tileWidth,
    tileHeight,
    overlapX,
    overlapY,
    outputWidth: (cols - 1) * stepX + tileWidth,
    outputHeight: (rows - 1) * stepY + tileHeight,
    tiles,
  };
}


/**
 * bounds를 커버하는 캡처 격자 계획을 생성한다.
 */
export function buildCaptureGridPlan(
  options: BuildCaptureGridOptions,
): CaptureGridPlan {
  if (options.map) {
    return buildCaptureGridPlanFromProjection(options.map, options);
  }
  return buildCaptureGridPlanFromSpan(options);
}


/**
 * 실제 촬영된 지도 중심들로 destX/destY를 다시 계산한다.
 * setCenter 오차·투영 비선형을 합성 단계에서 보정한다.
 */
export function refineCapturePlanDestinations(
  map: KakaoMap,
  plan: CaptureGridPlan,
  actualCenters: LatLngLiteral[],
): CaptureGridPlan {
  if (actualCenters.length !== plan.tiles.length) {
    throw new Error(
      `중심 수 불일치: plan=${plan.tiles.length}, centers=${actualCenters.length}`,
    );
  }
  if (actualCenters.length === 0) {
    return plan;
  }

  const origin = actualCenters[0];
  const refinedTiles = plan.tiles.map((tile, index) => {
    const offset = measurePixelOffsetBetween(map, origin, actualCenters[index]);
    return {
      ...tile,
      center: actualCenters[index],
      destX: Math.round(offset.dx),
      destY: Math.round(offset.dy),
    };
  });

  const minLeft = Math.min(...refinedTiles.map((tile) => tile.destX));
  const minTop = Math.min(...refinedTiles.map((tile) => tile.destY));

  // 음수 dest가 있으면 전체를 밀어 원점을 (0,0)으로 맞춤
  const shiftX = minLeft < 0 ? -minLeft : 0;
  const shiftY = minTop < 0 ? -minTop : 0;

  const tiles = refinedTiles.map((tile) => ({
    ...tile,
    destX: tile.destX + shiftX,
    destY: tile.destY + shiftY,
  }));

  return {
    ...plan,
    tiles,
    outputWidth: Math.max(...tiles.map((tile) => tile.destX + plan.tileWidth)),
    outputHeight: Math.max(
      ...tiles.map((tile) => tile.destY + plan.tileHeight),
    ),
  };
}


/**
 * 수동 촬영 목록을 행우선(좌→우, 위→아래) 격자로 배치하는 계획을 만든다.
 */
export function buildManualStitchPlan(options: {
  tileCount: number;
  cols: number;
  tileWidth: number;
  tileHeight: number;
  overlapRatio?: number;
}): CaptureGridPlan {
  const tileCount = Math.max(0, options.tileCount);
  const cols = Math.max(1, Math.floor(options.cols));
  const rows = Math.max(1, Math.ceil(tileCount / cols));
  const overlapRatio = clamp(
    options.overlapRatio ?? DEFAULT_OVERLAP_RATIO,
    0,
    0.4,
  );

  const { tileWidth, tileHeight } = options;
  const overlapX = Math.round(tileWidth * overlapRatio);
  const overlapY = Math.round(tileHeight * overlapRatio);
  const stepX = Math.max(1, tileWidth - overlapX);
  const stepY = Math.max(1, tileHeight - overlapY);

  const tiles: CaptureTilePlan[] = [];
  for (let index = 0; index < tileCount; index += 1) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    tiles.push({
      row,
      col,
      center: { lat: 0, lng: 0 },
      destX: col * stepX,
      destY: row * stepY,
    });
  }

  return {
    rows,
    cols,
    tileWidth,
    tileHeight,
    overlapX,
    overlapY,
    outputWidth: (cols - 1) * stepX + tileWidth,
    outputHeight: (rows - 1) * stepY + tileHeight,
    tiles,
  };
}


/**
 * 고해상도 캡처(scale>1)에 맞춰 격자 좌표·크기를 스케일한다.
 */
export function scaleCaptureGridPlan(
  plan: CaptureGridPlan,
  scaleX: number,
  scaleY: number = scaleX,
): CaptureGridPlan {
  return {
    ...plan,
    tileWidth: Math.round(plan.tileWidth * scaleX),
    tileHeight: Math.round(plan.tileHeight * scaleY),
    overlapX: Math.round(plan.overlapX * scaleX),
    overlapY: Math.round(plan.overlapY * scaleY),
    outputWidth: Math.round(plan.outputWidth * scaleX),
    outputHeight: Math.round(plan.outputHeight * scaleY),
    tiles: plan.tiles.map((tile) => ({
      ...tile,
      destX: Math.round(tile.destX * scaleX),
      destY: Math.round(tile.destY * scaleY),
    })),
  };
}
