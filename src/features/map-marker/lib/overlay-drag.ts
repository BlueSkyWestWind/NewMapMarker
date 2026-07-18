/**
 * 정보창 패널을 드래그해 위치를 옮긴다.
 * CustomOverlay 좌표는 마커에 고정하고, 패널만 픽셀 오프셋으로 이동한다.
 * 삼각형·연결선은 항상 마커(앵커)를 가리킨다.
 */

export interface OverlayPanelOffset {
  x: number;
  y: number;
}

/** 기본: 마커 위쪽에 정보창을 띄운다 */
export const DEFAULT_OVERLAY_OFFSET: OverlayPanelOffset = { x: 0, y: -12 };

/** 캡처 시 capture-readable 기준 정보창 크기·간격 (syncOverlayLeader와 동일 값 사용) */
export const CAPTURE_PANEL_WIDTH = 360;
export const CAPTURE_PANEL_HEIGHT = 148;
export const CAPTURE_PANEL_GAP = 36;
const CAPTURE_VIEW_MARGIN = 12;

interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function readPointXY(point: {
  x: number;
  y: number;
  getX?: () => number;
  getY?: () => number;
}) {
  return {
    x: typeof point.x === "number" ? point.x : (point.getX?.() ?? 0),
    y: typeof point.y === "number" ? point.y : (point.getY?.() ?? 0),
  };
}

function screenPanelToOffset(
  markerX: number,
  markerY: number,
  panelLeft: number,
  panelTop: number,
  panelWidth: number,
  panelHeight: number,
  gap: number,
): OverlayPanelOffset {
  return {
    x: panelLeft - markerX + panelWidth / 2,
    y: panelTop - markerY + panelHeight + gap,
  };
}

/**
 * 현재 화면 안의 고정 슬롯에 정보창을 배치한다.
 * (화면 밖으로 나가 잘리거나, 연결선만 남는 문제를 방지)
 */
export function computeCaptureOverlayOffsets(options: {
  map: KakaoMap;
  viewportWidth: number;
  viewportHeight: number;
  markers: Array<{ id: string; lat: number; lng: number }>;
  panelWidth?: number;
  panelHeight?: number;
}): Map<string, OverlayPanelOffset> {
  const projection = options.map.getProjection();
  const panelWidth = options.panelWidth ?? CAPTURE_PANEL_WIDTH;
  const panelHeight = options.panelHeight ?? CAPTURE_PANEL_HEIGHT;
  const gap = CAPTURE_PANEL_GAP;
  const margin = CAPTURE_VIEW_MARGIN;
  const result = new Map<string, OverlayPanelOffset>();

  if (
    !projection ||
    options.viewportWidth <= 0 ||
    options.viewportHeight <= 0
  ) {
    return result;
  }

  const vw = options.viewportWidth;
  const vh = options.viewportHeight;

  // 현재 화면에 가까운 마커만 배치 (화면 밖 마커는 기본 오프셋)
  const items = options.markers
    .map((marker) => {
      const point = readPointXY(
        projection.containerPointFromCoords(
          new window.kakao.maps.LatLng(marker.lat, marker.lng),
        ),
      );
      return { ...marker, x: point.x, y: point.y };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);

  // 각 마커 핀을 사각형 박스로 모델링 (핀 아이콘은 앵커 위쪽으로 물방울 모양)
  const PIN_HALF_W = 18;
  const PIN_UP = 44;
  const PIN_DOWN = 8;
  const pinBoxes = items
    .filter(
      (marker) =>
        marker.x >= -60 &&
        marker.x <= vw + 60 &&
        marker.y >= -60 &&
        marker.y <= vh + 60,
    )
    .map((marker) => ({
      id: marker.id,
      left: marker.x - PIN_HALF_W,
      right: marker.x + PIN_HALF_W,
      top: marker.y - PIN_UP,
      bottom: marker.y + PIN_DOWN,
    }));

  // 이미 배치한 패널 사각형 (패널끼리 덜 겹치도록 검사)
  const placedRects: ScreenRect[] = [];

  function rectsOverlapArea(a: ScreenRect, b: ScreenRect): number {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w <= 0 || h <= 0) return 0;
    return w * h;
  }

  // 패널을 자기 핀 주변에 붙이는 후보 위치(핀 기준 패널 좌상단 오프셋).
  // 가까운 간격을 우선하되, 막히면 더 멀리 밀어낸다.
  function buildCandidates(): Array<{ lx: number; ly: number; bias: number }> {
    const W = panelWidth;
    const H = panelHeight;
    const candidates: Array<{ lx: number; ly: number; bias: number }> = [];
    for (const g of [16, 96, 200, 320]) {
      // bias: 위쪽/오른쪽을 살짝 선호(정보창이 핀 위에 뜨는 일반적 형태)
      candidates.push({ lx: g, ly: -(H + g), bias: 0 }); // 우상
      candidates.push({ lx: -(W + g), ly: -(H + g), bias: 6 }); // 좌상
      candidates.push({ lx: g, ly: g, bias: 12 }); // 우하
      candidates.push({ lx: -(W + g), ly: g, bias: 18 }); // 좌하
      candidates.push({ lx: g, ly: -H / 2, bias: 8 }); // 우
      candidates.push({ lx: -(W + g), ly: -H / 2, bias: 10 }); // 좌
      candidates.push({ lx: -W / 2, ly: -(H + g), bias: 4 }); // 상
      candidates.push({ lx: -W / 2, ly: g, bias: 20 }); // 하
    }
    return candidates;
  }

  const candidates = buildCandidates();

  for (const marker of items) {
    const onScreen =
      marker.x >= -40 &&
      marker.x <= vw + 40 &&
      marker.y >= -40 &&
      marker.y <= vh + 40;

    if (!onScreen) {
      result.set(marker.id, { x: 0, y: -72 });
      continue;
    }

    let bestPos: { left: number; top: number } | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const cand of candidates) {
      const left = marker.x + cand.lx;
      const top = marker.y + cand.ly;
      const rect: ScreenRect = {
        left,
        top,
        right: left + panelWidth,
        bottom: top + panelHeight,
      };

      // 화면 밖으로 벗어난 양(잘림 방지)
      const overflow =
        Math.max(0, margin - rect.left) +
        Math.max(0, rect.right - (vw - margin)) +
        Math.max(0, margin - rect.top) +
        Math.max(0, rect.bottom - (vh - margin));

      // 자기 것 포함 어떤 핀이든 가리면 강한 감점 (모든 핀이 보여야 함)
      const pinCoverArea = pinBoxes.reduce(
        (sum, pin) => sum + rectsOverlapArea(rect, pin),
        0,
      );

      // 이미 배치된 패널과 겹치는 면적
      const overlapArea = placedRects.reduce(
        (sum, placed) => sum + rectsOverlapArea(rect, placed),
        0,
      );

      const score =
        -pinCoverArea * 200 -
        overflow * 400 -
        overlapArea * 0.5 -
        cand.bias;

      if (score > bestScore) {
        bestScore = score;
        bestPos = { left, top };
      }
    }

    const pos = bestPos ?? {
      left: marker.x + 16,
      top: marker.y - panelHeight - 16,
    };

    placedRects.push({
      left: pos.left,
      top: pos.top,
      right: pos.left + panelWidth,
      bottom: pos.top + panelHeight,
    });

    result.set(
      marker.id,
      screenPanelToOffset(
        marker.x,
        marker.y,
        pos.left,
        pos.top,
        panelWidth,
        panelHeight,
        gap,
      ),
    );
  }

  return result;
}

interface OverlayDragOptions {
  map: KakaoMap;
  overlay: KakaoCustomOverlay;
  initialOffset?: OverlayPanelOffset;
  onOffsetChange: (offset: OverlayPanelOffset) => void;
}

function closestPointOnRect(
  px: number,
  py: number,
  left: number,
  top: number,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: Math.min(Math.max(px, left), left + width),
    y: Math.min(Math.max(py, top), top + height),
  };
}

/**
 * 패널 오프셋과 마커를 잇는 연결선·삼각형 방향을 갱신한다.
 */
export function syncOverlayLeader(
  root: HTMLElement,
  offset: OverlayPanelOffset,
): void {
  const panel = root.querySelector(".custom-overlay");
  const stem = root.querySelector(".overlay-stem");
  const pointer = root.querySelector(".overlay-pointer");

  if (
    !(panel instanceof HTMLElement) ||
    !(stem instanceof HTMLElement) ||
    !(pointer instanceof HTMLElement)
  ) {
    return;
  }

  const isCaptureLayout = root.dataset.captureLayout === "true";
  // 캡처 배치는 슬롯 계산(computeCaptureOverlayOffsets)과 동일한 상수 크기를 써야
  // 패널이 계산한 위치에 정확히 놓여 마커 핀을 가리지 않는다.
  // (실제 offsetHeight는 내용에 따라 달라지므로 캡처 시에는 사용하지 않는다)
  const panelWidth = isCaptureLayout
    ? CAPTURE_PANEL_WIDTH
    : panel.offsetWidth || 280;
  const panelHeight = isCaptureLayout
    ? CAPTURE_PANEL_HEIGHT
    : panel.offsetHeight || 120;
  // 캡처 배치는 계산 시와 동일한 gap을 써야 창이 화면 밖으로 밀려나지 않는다
  const gap = isCaptureLayout
    ? CAPTURE_PANEL_GAP
    : Math.abs(offset.y) >= 60 || Math.abs(offset.x) >= 100
      ? CAPTURE_PANEL_GAP
      : 16;

  const panelLeft = -panelWidth / 2 + offset.x;
  const panelTop = -panelHeight - gap + offset.y;

  panel.style.transform = `translate(${panelLeft}px, ${panelTop}px)`;

  const closest = closestPointOnRect(
    0,
    0,
    panelLeft,
    panelTop,
    panelWidth,
    panelHeight,
  );
  const dx = closest.x;
  const dy = closest.y;
  const length = Math.hypot(dx, dy);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

  stem.style.width = `${Math.max(length, 0)}px`;
  stem.style.transform = `rotate(${angleDeg}deg)`;
  stem.style.opacity = length < 8 ? "0" : "1";

  // 패널 로컬 좌표에 삼각형 배치, 뾰족한 쪽이 마커(0,0)를 향하도록 회전
  const localX = closest.x - panelLeft;
  const localY = closest.y - panelTop;
  const pointAngleDeg = (Math.atan2(-closest.y, -closest.x) * 180) / Math.PI;

  pointer.style.left = `${localX}px`;
  pointer.style.top = `${localY}px`;
  pointer.style.transform = `translate(-50%, -50%) rotate(${pointAngleDeg + 45}deg)`;
  pointer.style.opacity = length < 8 ? "0" : "1";
}

export function applyOverlayOffset(
  root: HTMLElement,
  offset: OverlayPanelOffset,
): void {
  syncOverlayLeader(root, offset);
}

export function enableOverlayDrag({
  map,
  overlay,
  initialOffset = DEFAULT_OVERLAY_OFFSET,
  onOffsetChange,
}: OverlayDragOptions): void {
  const content = overlay.getContent();
  if (!(content instanceof HTMLElement)) return;

  const panel = content.querySelector(".custom-overlay");
  const header = content.querySelector(".overlay-header");
  if (!(panel instanceof HTMLElement) || !(header instanceof HTMLElement)) {
    return;
  }

  let currentOffset: OverlayPanelOffset = { ...initialOffset };
  applyOverlayOffset(content, currentOffset);

  // 주소 비동기 로드 등으로 높이가 바뀌면 연결선·삼각형을 다시 맞춘다
  const resizeObserver = new ResizeObserver(() => {
    applyOverlayOffset(content, currentOffset);
  });
  resizeObserver.observe(panel);

  header.classList.add("overlay-header-draggable");
  header.title = "드래그하여 정보창 위치 이동";

  header.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(".overlay-close")) {
      return;
    }
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startOffset = { ...currentOffset };
    const pointerId = event.pointerId;

    map.setDraggable(false);
    header.classList.add("is-dragging");
    content.style.zIndex = "20";
    overlay.setZIndex?.(20);

    try {
      header.setPointerCapture(pointerId);
    } catch {
      // ignore
    }

    let isFinished = false;

    const finishDrag = () => {
      if (isFinished) return;
      isFinished = true;

      map.setDraggable(true);
      header.classList.remove("is-dragging");
      content.style.zIndex = "";
      overlay.setZIndex?.(10);

      header.removeEventListener("pointermove", handlePointerMove);
      header.removeEventListener("pointerup", handlePointerUp);
      header.removeEventListener("pointercancel", handlePointerUp);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", handlePointerUp, true);

      try {
        if (header.hasPointerCapture(pointerId)) {
          header.releasePointerCapture(pointerId);
        }
      } catch {
        // ignore
      }

      onOffsetChange(currentOffset);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;

      currentOffset = {
        x: startOffset.x + (moveEvent.clientX - startClientX),
        y: startOffset.y + (moveEvent.clientY - startClientY),
      };
      applyOverlayOffset(content, currentOffset);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      upEvent.preventDefault();
      upEvent.stopPropagation();
      finishDrag();
    };

    header.addEventListener("pointermove", handlePointerMove);
    header.addEventListener("pointerup", handlePointerUp);
    header.addEventListener("pointercancel", handlePointerUp);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointercancel", handlePointerUp, true);
  });
}
