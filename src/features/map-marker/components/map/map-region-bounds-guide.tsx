"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type {
  CaptureGridPlan,
  MapBoundsLiteral,
} from "@/features/map-marker/lib/map-capture-stitch";

interface MapRegionBoundsGuideProps {
  map: KakaoMap;
  bounds: MapBoundsLiteral;
  plan: CaptureGridPlan | null;
  viewportSpan: { latSpan: number; lngSpan: number } | null;
  /** 이미 촬영한 타일 수 — 다음 칸 강조용 */
  capturedCount?: number;
  /** 캡처에서 제외된 타일 인덱스 집합 */
  excludedIndices?: Set<number>;
  /** 격자 칸 클릭으로 포함/제외를 토글 (미리보기 단계에서만) */
  onToggleTile?: (index: number) => void;
  /** 칸 클릭 상호작용 허용 여부 */
  interactive?: boolean;
  /** 범위 이동·크기 조절 결과 */
  onBoundsChange?: (bounds: MapBoundsLiteral) => void;
  /** 편집 핸들을 지도 화면 안에 유지하기 위한 컨테이너 */
  mapContainer?: HTMLElement;
}

interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface GridCellScreen extends ScreenRect {
  key: string;
  label: string;
  index: number;
}

type BoundsEditMode = "move" | "resize";

interface BoundsEditState {
  mode: BoundsEditMode;
  pointerId: number;
  startX: number;
  startY: number;
  rect: ScreenRect;
}

const MIN_REGION_SIZE_PX = 120;

function screenRectToBounds(map: KakaoMap, rect: ScreenRect): MapBoundsLiteral {
  const projection = map.getProjection();
  if (!projection) throw new Error("지도 projection을 읽을 수 없습니다.");
  const nw = projection.coordsFromContainerPoint(
    new window.kakao.maps.Point(rect.left, rect.top),
  );
  const se = projection.coordsFromContainerPoint(
    new window.kakao.maps.Point(
      rect.left + rect.width,
      rect.top + rect.height,
    ),
  );
  return {
    sw: { lat: se.getLat(), lng: nw.getLng() },
    ne: { lat: nw.getLat(), lng: se.getLng() },
  };
}

function projectBoundsToScreen(
  map: KakaoMap,
  swLat: number,
  swLng: number,
  neLat: number,
  neLng: number,
): ScreenRect | null {
  const projection = map.getProjection();
  if (!projection) return null;

  const swPoint = projection.containerPointFromCoords(
    new window.kakao.maps.LatLng(swLat, swLng),
  );
  const nePoint = projection.containerPointFromCoords(
    new window.kakao.maps.LatLng(neLat, neLng),
  );

  const left = Math.min(swPoint.x, nePoint.x);
  const right = Math.max(swPoint.x, nePoint.x);
  const top = Math.min(swPoint.y, nePoint.y);
  const bottom = Math.max(swPoint.y, nePoint.y);

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/**
 * 지정 범위와 캡처 격자를 지도 위에 표시한다.
 */
export function MapRegionBoundsGuide({
  map,
  bounds,
  plan,
  viewportSpan,
  capturedCount = 0,
  excludedIndices,
  onToggleTile,
  interactive = false,
  onBoundsChange,
  mapContainer,
}: MapRegionBoundsGuideProps) {
  const [regionRect, setRegionRect] = useState<ScreenRect | null>(null);
  const [editRect, setEditRect] = useState<ScreenRect | null>(null);
  const [cells, setCells] = useState<GridCellScreen[]>([]);
  const editRef = useRef<BoundsEditState | null>(null);

  useEffect(() => {
    if (!window.kakao?.maps) return;

    const update = () => {
      setRegionRect(
        projectBoundsToScreen(
          map,
          bounds.sw.lat,
          bounds.sw.lng,
          bounds.ne.lat,
          bounds.ne.lng,
        ),
      );

      if (!plan) {
        setCells([]);
        return;
      }

      const projection = map.getProjection();

      // 목표 레벨 픽셀을 현재 지도 레벨 화면 픽셀로 환산하는 계수
      // (captureLevel이 있으면 픽셀 정밀, 없으면 span 폴백)
      const factor =
        plan.captureLevel != null
          ? 2 ** (map.getLevel() - plan.captureLevel)
          : null;

      const nextCells: GridCellScreen[] = [];
      for (let index = 0; index < plan.tiles.length; index += 1) {
        const tile = plan.tiles[index];

        let rect: ScreenRect | null = null;

        if (factor != null && projection) {
          // 타일 중심을 화면에 투영하고, 화면 타일 픽셀 크기의 절반만큼 확장
          const center = projection.containerPointFromCoords(
            new window.kakao.maps.LatLng(tile.center.lat, tile.center.lng),
          );
          const screenW = plan.tileWidth / factor;
          const screenH = plan.tileHeight / factor;
          rect = {
            left: center.x - screenW / 2,
            top: center.y - screenH / 2,
            width: Math.max(1, screenW),
            height: Math.max(1, screenH),
          };
        } else if (viewportSpan) {
          const halfLat = viewportSpan.latSpan / 2;
          const halfLng = viewportSpan.lngSpan / 2;
          rect = projectBoundsToScreen(
            map,
            tile.center.lat - halfLat,
            tile.center.lng - halfLng,
            tile.center.lat + halfLat,
            tile.center.lng + halfLng,
          );
        }

        if (!rect) continue;

        nextCells.push({
          ...rect,
          key: `${tile.row}-${tile.col}`,
          label: `${index + 1}`,
          index,
        });
      }
      setCells(nextCells);
    };

    update();
    window.kakao.maps.event.addListener(map, "idle", update);
    window.kakao.maps.event.addListener(map, "zoom_changed", update);
    window.kakao.maps.event.addListener(map, "center_changed", update);

    return () => {
      window.kakao.maps.event.removeListener(map, "idle", update);
      window.kakao.maps.event.removeListener(map, "zoom_changed", update);
      window.kakao.maps.event.removeListener(map, "center_changed", update);
    };
  }, [map, bounds, plan, viewportSpan]);

  if (!regionRect) return null;
  const displayedRegionRect = editRect ?? regionRect;
  const canEditBounds = interactive && !!onBoundsChange;
  const viewportWidth = mapContainer?.clientWidth ?? window.innerWidth;
  const viewportHeight = mapContainer?.clientHeight ?? window.innerHeight;
  const moveHandleLeft = Math.min(
    viewportWidth - 56,
    Math.max(56, displayedRegionRect.left + displayedRegionRect.width / 2),
  );
  const moveHandleTop = Math.min(
    viewportHeight - 18,
    Math.max(18, displayedRegionRect.top),
  );
  const resizeHandleLeft = Math.min(
    viewportWidth - 14,
    Math.max(14, displayedRegionRect.left + displayedRegionRect.width),
  );
  const resizeHandleTop = Math.min(
    viewportHeight - 14,
    Math.max(14, displayedRegionRect.top + displayedRegionRect.height),
  );

  const startBoundsEdit = (
    event: PointerEvent<HTMLButtonElement>,
    mode: BoundsEditMode,
  ) => {
    if (!canEditBounds || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    editRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect: { ...displayedRegionRect },
    };
    setEditRect({ ...displayedRegionRect });
  };

  const moveBoundsEdit = (event: PointerEvent<HTMLButtonElement>) => {
    const edit = editRef.current;
    if (!edit || edit.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - edit.startX;
    const dy = event.clientY - edit.startY;

    if (edit.mode === "move") {
      setEditRect({
        ...edit.rect,
        left: edit.rect.left + dx,
        top: edit.rect.top + dy,
      });
      return;
    }

    setEditRect({
      ...edit.rect,
      width: Math.max(MIN_REGION_SIZE_PX, edit.rect.width + dx),
      height: Math.max(MIN_REGION_SIZE_PX, edit.rect.height + dy),
    });
  };

  const finishBoundsEdit = (event: PointerEvent<HTMLButtonElement>) => {
    const edit = editRef.current;
    if (!edit || edit.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const finalRect = editRect;
    editRef.current = null;
    setEditRect(null);
    if (finalRect) onBoundsChange?.(screenRectToBounds(map, finalRect));
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-[15] overflow-hidden">
      <div
        className="absolute border-2 border-dashed border-sky-400 bg-sky-400/10"
        data-capture-hide="true"
        style={{
          left: displayedRegionRect.left,
          top: displayedRegionRect.top,
          width: displayedRegionRect.width,
          height: displayedRegionRect.height,
        }}
      />

      {canEditBounds ? (
        <>
          <button
            type="button"
            className="pointer-events-auto absolute z-20 -translate-x-1/2 -translate-y-1/2 cursor-move rounded border border-amber-300 bg-slate-900/90 px-2 py-1 text-[10px] font-semibold text-amber-200 shadow-lg"
            style={{
              left: moveHandleLeft,
              top: moveHandleTop,
            }}
            onPointerDown={(event) => startBoundsEdit(event, "move")}
            onPointerMove={moveBoundsEdit}
            onPointerUp={finishBoundsEdit}
            onPointerCancel={finishBoundsEdit}
            data-capture-hide="true"
            title="드래그하여 캡처 영역 이동"
          >
            영역 이동
          </button>
          <button
            type="button"
            className="pointer-events-auto absolute z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-full border-2 border-amber-200 bg-amber-500 shadow-lg"
            style={{
              left: resizeHandleLeft,
              top: resizeHandleTop,
            }}
            onPointerDown={(event) => startBoundsEdit(event, "resize")}
            onPointerMove={moveBoundsEdit}
            onPointerUp={finishBoundsEdit}
            onPointerCancel={finishBoundsEdit}
            data-capture-hide="true"
            title="드래그하여 캡처 범위 크기 조절"
          />
        </>
      ) : null}

      {cells.map((cell) => {
        const isExcluded = excludedIndices?.has(cell.index) ?? false;
        const isCaptured = cell.index < capturedCount;
        const isNext = cell.index === capturedCount;
        const canToggle = interactive && !!onToggleTile;

        const cellClassName = isExcluded
          ? "absolute border-2 border-dashed border-slate-400/80 bg-slate-900/55"
          : isNext
            ? "absolute border-2 border-amber-400 bg-amber-400/20"
            : isCaptured
              ? "absolute border-2 border-emerald-400/80 bg-emerald-400/15"
              : "absolute border-2 border-sky-400/90 bg-sky-400/15 transition-colors";

        const badgeClassName = isExcluded
          ? "absolute left-1 top-1 rounded bg-slate-700/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 line-through"
          : isNext
            ? "absolute left-1 top-1 rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-950"
            : isCaptured
              ? "absolute left-1 top-1 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white"
              : "absolute left-1 top-1 rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-semibold text-sky-100";

        return (
          <div
            key={cell.key}
            className={
              cellClassName +
              (canToggle
                ? " pointer-events-none"
                : "")
            }
            data-capture-hide="true"
            style={{
              left: cell.left,
              top: cell.top,
              width: cell.width,
              height: cell.height,
            }}
          >
            <button
              type="button"
              className={
                badgeClassName +
                (canToggle
                  ? " pointer-events-auto cursor-pointer hover:ring-2 hover:ring-sky-200"
                  : " pointer-events-none")
              }
              onClick={
                canToggle ? () => onToggleTile?.(cell.index) : undefined
              }
              title={
                canToggle
                  ? isExcluded
                    ? "클릭하면 캡처에 포함"
                    : "클릭하면 캡처에서 제외"
                  : undefined
              }
            >
              {cell.label}
            </button>
            {isExcluded ? (
              <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-slate-400/60">
                ✕
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
