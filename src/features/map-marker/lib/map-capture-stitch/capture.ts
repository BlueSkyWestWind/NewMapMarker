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
import {
  buildCaptureGridPlan,
  refineCapturePlanDestinations, buildManualStitchPlan, scaleCaptureGridPlan,
} from "./plan";


/**
 * 캡처된 타일 이미지들을 계획된 좌표로 이어붙인다.
 * 겹침 구간은 이후 타일이 덮어쓰며, dest는 refine된 실제 중심 기준을 권장한다.
 */
export async function stitchCaptureTiles(
  plan: CaptureGridPlan,
  tileImages: CanvasImageSource[],
): Promise<HTMLCanvasElement> {
  if (tileImages.length !== plan.tiles.length) {
    throw new Error(
      `타일 수 불일치: plan=${plan.tiles.length}, images=${tileImages.length}`,
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = plan.outputWidth;
  canvas.height = plan.outputHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context를 생성할 수 없습니다.");
  }

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  // 행·열 순으로 안정적으로 덮이도록 정렬
  const drawOrder = plan.tiles
    .map((tile, index) => ({ tile, index }))
    .sort((a, b) => a.tile.row - b.tile.row || a.tile.col - b.tile.col);

  for (const { tile, index } of drawOrder) {
    ctx.drawImage(
      tileImages[index],
      0,
      0,
      plan.tileWidth,
      plan.tileHeight,
      tile.destX,
      tile.destY,
      plan.tileWidth,
      plan.tileHeight,
    );
  }

  return canvas;
}


export function waitForMapSettle(ms: number = 700): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}


/**
 * 격자 캡처를 실행하고 합성본 + 개별 타일을 반환한다.
 * 촬영 후 실제 중심 좌표로 dest를 재계산해 이음새 오차를 줄인다.
 */
export async function runGridCapture(options: {
  plan: CaptureGridPlan;
  map: KakaoMap;
  setCenter: (center: LatLngLiteral) => void | Promise<void>;
  getCenter: () => LatLngLiteral;
  captureViewport: () => Promise<HTMLCanvasElement>;
  /** setCenter 후 추가 대기(ms). 기본 타일 로딩 대기는 capture 쪽에서 수행 */
  settleMs?: number;
  onProgress?: (current: number, total: number, tile: CaptureTilePlan) => void;
  /** 타일 한 칸 실패 시 기존 성공분을 유지하고 같은 칸을 다시 촬영할지 결정 */
  shouldRetryTile?: (
    error: unknown,
    tile: CaptureTilePlan,
    attempt: number,
  ) => boolean;
  onTileRetry?: (
    tile: CaptureTilePlan,
    index: number,
    attempt: number,
    error: unknown,
  ) => void;
}): Promise<GridCaptureResult> {
  const tiles: CapturedTileImage[] = [];
  const actualCenters: LatLngLiteral[] = [];

  for (let index = 0; index < options.plan.tiles.length; index += 1) {
    const tile = options.plan.tiles[index];
    let attempt = 0;

    while (true) {
      attempt += 1;
      try {
        await options.setCenter(tile.center);
        await waitForMapSettle(options.settleMs ?? 500);

        const canvas = await options.captureViewport();

        // 캡처와 동일 시점의 실제 중심 기록 (setCenter 스냅·idle 이후)
        actualCenters.push(options.getCenter());
        tiles.push({
          row: tile.row,
          col: tile.col,
          canvas,
        });
        options.onProgress?.(index + 1, options.plan.tiles.length, tile);
        break;
      } catch (error) {
        if (!options.shouldRetryTile?.(error, tile, attempt)) throw error;
        options.onTileRetry?.(tile, index, attempt, error);
        await waitForMapSettle(Math.min(5000, 1000 * attempt));
      }
    }

    if (index < options.plan.tiles.length - 1) {
      await waitForMapSettle(200);
    }
  }

  // dest 보정을 위해 원점(첫 타일 중심)으로 맞춘 뒤 픽셀 오프셋 측정
  await options.setCenter(actualCenters[0]);
  await waitForMapSettle(400);

  const refinedPlan = refineCapturePlanDestinations(
    options.map,
    options.plan,
    actualCenters,
  );

  const first = tiles[0]?.canvas;
  const scaleX = first ? first.width / refinedPlan.tileWidth : 1;
  const scaleY = first ? first.height / refinedPlan.tileHeight : 1;
  const scaledPlan = scaleCaptureGridPlan(refinedPlan, scaleX, scaleY);

  const stitched = await stitchCaptureTiles(
    scaledPlan,
    tiles.map((tile) => tile.canvas),
  );

  return { stitched, tiles, plan: scaledPlan };
}


/**
 * 개별 타일 PNG를 ZIP으로 묶어 다운로드한다.
 */
export async function downloadTilesAsZip(
  tiles: CapturedTileImage[],
  zipFilename: string,
): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const { canvasToBlob, downloadBlob } =
    await import("@/features/map-marker/lib/map-viewport-capture");

  const zip = new JSZip();

  for (const tile of tiles) {
    const blob = await canvasToBlob(tile.canvas);
    zip.file(
      `tile_r${String(tile.row).padStart(2, "0")}_c${String(tile.col).padStart(2, "0")}.png`,
      blob,
    );
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  downloadBlob(zipBlob, zipFilename);
}


export function createCaptureTimestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}
