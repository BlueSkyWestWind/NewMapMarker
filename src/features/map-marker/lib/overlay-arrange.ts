import {
  CAPTURE_PANEL_GAP,
  DEFAULT_OVERLAY_OFFSET,
  type OverlayPanelOffset,
} from "./overlay-drag";

/**
 * 여러 정보창(마커창)을 **지도 양쪽 가장자리의 세로 열**로 배치하는 계산(순수 함수).
 *
 * 정보창은 핀에 고정된 CustomOverlay 안에서 패널만 픽셀 오프셋으로 옮긴다. 같은 자리에 핀이 몰린 국소들은
 * 기본 오프셋이 같아 카드가 한 자리에 쌓이므로, 핀이 있는 쪽(왼쪽/오른쪽)의 가장자리 열에 세로로 차곡차곡
 * 놓고 연결선으로 핀과 잇는다. 오프셋 ↔ 화면 위치 변환은 `syncOverlayLeader`(overlay-drag.ts)와 같은 식을 써야
 * 계산한 자리에 놓인다.
 */

export interface ArrangeItem {
  id: string;
  /** 지도 컨테이너 기준 핀의 화면 좌표(px) */
  x: number;
  y: number;
  /** 정보창 패널의 크기(px) */
  width: number;
  height: number;
}

export interface ArrangeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 대시보드의 마커창(날씨 카드 + 정보 카드)을 배치할 때 쓰는 패널 최소 크기(px). 날씨가 늦게 불러와져 패널이 자라도 겹치지 않게 넉넉히 잡는다. */
export const OVERLAY_ARRANGE_MIN_WIDTH = 340;
export const OVERLAY_ARRANGE_MIN_HEIGHT = 275;

/** 카드가 많아 한 열에 안 들어갈 때 카드를 줄일 수 있는 한계(글자가 읽히는 정도)와 줄이는 단위 */
const MIN_SCALE = 0.7;
const SCALE_STEP = 0.05;

/** `syncOverlayLeader`의 기본 간격 규칙: 멀리 떨어진 배치는 36, 가까우면 16 */
const NEAR_GAP = 16;
const FAR_GAP = CAPTURE_PANEL_GAP;
const VIEW_MARGIN = 12;
/** 오른쪽 열은 지도 컨트롤(줌·위치 버튼)을 가리지 않도록 그만큼 안쪽에 둔다 */
const RIGHT_MARGIN = 72;
/** 지도 위쪽의 검색창을 피하는 여백 */
const VIEW_TOP_MARGIN = 52;
/** 카드 사이 세로·가로 간격 */
const CARD_GAP = 16;
const ONSCREEN_SLACK = 40;
/** 지도를 맞출 때 핀과 카드 열 사이에 두는 여유 */
const FIT_COLUMN_SLACK = 60;
const FIT_VERTICAL_PADDING = 90;

function gapFor(offset: OverlayPanelOffset): number {
  return Math.abs(offset.y) >= 60 || Math.abs(offset.x) >= 100 ? FAR_GAP : NEAR_GAP;
}

/** 오프셋으로 놓인 패널의 화면 사각형(`syncOverlayLeader`와 같은 식). */
export function panelRectOf(
  item: Pick<ArrangeItem, "x" | "y" | "width" | "height">,
  offset: OverlayPanelOffset,
  options: { fixedGap?: boolean } = {},
): ArrangeRect {
  const gap = options.fixedGap ? FAR_GAP : gapFor(offset);
  const left = item.x - item.width / 2 + offset.x;
  const top = item.y - item.height - gap + offset.y;
  return { left, top, right: left + item.width, bottom: top + item.height };
}

/**
 * 패널 좌상단을 (left, top)에 두는 오프셋. 자동 배치한 정보창은 간격을 `FAR_GAP`으로 고정해서 그린다
 * (`setOverlayPanelLayout`). 간격 규칙이 오프셋에 따라 바뀌면 경계에서 위치가 20px 튀기 때문이다.
 */
function offsetFor(item: ArrangeItem, left: number, top: number): OverlayPanelOffset {
  return { x: left - item.x + item.width / 2, y: top - item.y + item.height + FAR_GAP };
}

/**
 * 지도를 국소에 맞출 때(`setBounds`) 둘 여백. 좌우는 카드 열이 들어갈 만큼 비워 핀이 가운데 모이게 하고,
 * 위아래는 가장자리 여백만 둔다.
 */
export function boardFitPadding(): { top: number; right: number; bottom: number; left: number } {
  return {
    top: FIT_VERTICAL_PADDING,
    right: OVERLAY_ARRANGE_MIN_WIDTH + RIGHT_MARGIN + FIT_COLUMN_SLACK,
    bottom: FIT_VERTICAL_PADDING,
    left: OVERLAY_ARRANGE_MIN_WIDTH + VIEW_MARGIN + FIT_COLUMN_SLACK,
  };
}

/** 열 하나에 들어가는 세로 길이 */
function columnSpan(viewportHeight: number): number {
  return viewportHeight - VIEW_TOP_MARGIN - VIEW_MARGIN;
}

/** 위에서부터 채워 열이 몇 개 필요한지(높이가 합쳐서 열 길이를 넘으면 다음 열). */
function chunkIntoColumns(items: ArrangeItem[], span: number): ArrangeItem[][] {
  const columns: ArrangeItem[][] = [];
  let used = 0;
  for (const entry of items) {
    const need = entry.height + (columns.length > 0 && used > 0 ? CARD_GAP : 0);
    if (columns.length === 0 || used + need > span) {
      columns.push([entry]);
      used = entry.height;
    } else {
      columns[columns.length - 1].push(entry);
      used += need;
    }
  }
  return columns;
}

const byPinPosition = (a: ArrangeItem, b: ArrangeItem) =>
  a.y - b.y || a.x - b.x || a.id.localeCompare(b.id);

/**
 * 한쪽에 열이 둘 이상 필요한데 반대쪽 열에 여유가 있으면, 가운데에 가까운 국소부터 반대쪽으로 넘겨 열 수를 줄인다.
 * 넘긴 뒤에도 반대쪽 열 수가 처음의 열 수보다 적어야 넘긴다(열이 오히려 늘면 그대로 둔다).
 */
function rebalance(
  heavy: ArrangeItem[],
  light: ArrangeItem[],
  centerX: number,
  span: number,
): { heavy: ArrangeItem[]; light: ArrangeItem[] } {
  const startColumns = chunkIntoColumns([...heavy].sort(byPinPosition), span).length;
  if (startColumns <= 1) return { heavy, light };

  // 가운데에서 먼 것이 앞에 오도록 정렬하고, 가운데에 가까운 것(뒤쪽)부터 넘긴다.
  const nextHeavy = [...heavy].sort(
    (a, b) => Math.abs(b.x - centerX) - Math.abs(a.x - centerX) || byPinPosition(a, b),
  );
  const nextLight = [...light];
  while (
    nextHeavy.length > 0 &&
    chunkIntoColumns([...nextHeavy].sort(byPinPosition), span).length >= startColumns
  ) {
    nextLight.push(nextHeavy.pop()!);
  }
  const lightColumns = chunkIntoColumns([...nextLight].sort(byPinPosition), span).length;
  return lightColumns < startColumns ? { heavy: nextHeavy, light: nextLight } : { heavy, light };
}

interface SideLayout {
  left: ArrangeItem[];
  right: ArrangeItem[];
  leftColumns: number;
  rightColumns: number;
  columnWidth: number;
  /** 모든 카드에 같이 주는 칸 높이(줄인 뒤 크기). 카드 높이가 달라도 세로 간격이 같아진다. */
  slotHeight: number;
  /** 줄인 뒤 카드의 실제 높이(칸 안에서 위쪽에 맞춰 놓는다) */
  realHeights: Map<string, number>;
}

/** 카드 크기를 `scale`배로 보고 왼쪽/오른쪽 열로 나눈다(한쪽에 몰려 열이 늘면 반대쪽으로 넘긴다). */
function splitSides(items: ArrangeItem[], scale: number, vw: number, vh: number): SideLayout {
  const slotHeight = Math.max(...items.map((item) => item.height)) * scale;
  const realHeights = new Map(items.map((item) => [item.id, item.height * scale]));
  const scaled = items.map((item) => ({
    ...item,
    width: item.width * scale,
    height: slotHeight,
  }));
  const centerX = vw / 2;
  const span = columnSpan(vh);
  let left = scaled.filter((item) => item.x < centerX);
  let right = scaled.filter((item) => item.x >= centerX);
  if (left.length >= right.length) {
    ({ heavy: left, light: right } = rebalance(left, right, centerX, span));
  } else {
    ({ heavy: right, light: left } = rebalance(right, left, centerX, span));
  }
  return {
    left,
    right,
    leftColumns: chunkIntoColumns([...left].sort(byPinPosition), span).length,
    rightColumns: chunkIntoColumns([...right].sort(byPinPosition), span).length,
    columnWidth: Math.max(...scaled.map((item) => item.width)),
    slotHeight,
    realHeights,
  };
}

/**
 * 카드를 가장자리 열에만 두려고 줄이는 배율을 정한다. 한쪽 열 하나에 다 들어가는 가장 큰 배율을 먼저 찾고,
 * 줄여도 안 되면 한쪽에 열 둘까지 허용해 다시 찾는다. 그래도 안 되면 가장 작은 배율로 둔다(안쪽 열이 늘어난다).
 */
function chooseLayout(items: ArrangeItem[], vw: number, vh: number): { scale: number; layout: SideLayout } {
  const scales: number[] = [];
  for (let scale = 1; scale >= MIN_SCALE - 1e-9; scale -= SCALE_STEP) {
    scales.push(Math.round(scale * 100) / 100);
  }
  for (const maxColumns of [1, 2]) {
    for (const scale of scales) {
      const layout = splitSides(items, scale, vw, vh);
      const columns = layout.leftColumns + layout.rightColumns;
      const usedWidth =
        VIEW_MARGIN + RIGHT_MARGIN + columns * layout.columnWidth + Math.max(0, columns - 1) * CARD_GAP;
      if (
        layout.leftColumns <= maxColumns &&
        layout.rightColumns <= maxColumns &&
        usedWidth <= vw
      ) {
        return { scale, layout };
      }
    }
  }
  const scale = scales[scales.length - 1];
  return { scale, layout: splitSides(items, scale, vw, vh) };
}

/**
 * 정보창들의 오프셋과 배율을 정한다. 핀이 화면 왼쪽 절반이면 왼쪽 가장자리 열, 오른쪽 절반이면 오른쪽 가장자리 열에
 * 위에서 아래로(핀이 위에 있는 순) 같은 간격으로 쌓는다(양쪽 열이 같은 높이에서 시작). 가운데에는 두지 않는다. 한쪽에 몰리면 반대쪽으로 나눠 담고, 그래도 한 열에
 * 안 들어가면 카드를 줄이며(`scale`, 최소 0.7), 줄여도 모자랄 때만 안쪽에 열을 더한다.
 * 반환한 오프셋은 카드를 `scale`배로 줄여 그린 크기 기준이다. 화면 밖 핀은 기본 오프셋을 준다.
 */
export function arrangeOverlayPanels(input: {
  viewportWidth: number;
  viewportHeight: number;
  items: ArrangeItem[];
}): {
  offsets: Map<string, OverlayPanelOffset>;
  scale: number;
  /** 열에 배치한(= 간격 고정·배율을 적용할) 정보창 id. 화면 밖 핀은 빠진다. */
  placedIds: Set<string>;
} {
  const { viewportWidth: vw, viewportHeight: vh } = input;
  const offsets = new Map<string, OverlayPanelOffset>();
  const sorted = [...input.items].sort(byPinPosition);
  const onScreen = (item: ArrangeItem) =>
    item.x >= -ONSCREEN_SLACK &&
    item.x <= vw + ONSCREEN_SLACK &&
    item.y >= -ONSCREEN_SLACK &&
    item.y <= vh + ONSCREEN_SLACK;

  const visible: ArrangeItem[] = [];
  for (const item of sorted) {
    if (onScreen(item)) visible.push(item);
    else offsets.set(item.id, { ...DEFAULT_OVERLAY_OFFSET });
  }
  if (visible.length === 0) return { offsets, scale: 1, placedIds: new Set() };

  const { scale, layout } = chooseLayout(visible, vw, vh);
  const span = columnSpan(vh);
  // 열마다 같은 높이(위쪽 여백)에서 시작해 같은 간격으로 쌓는다. 핀 높이는 따르지 않는다(연결선이 이어 준다).
  const pitch = layout.slotHeight + CARD_GAP;
  const place = (side: "left" | "right", entries: ArrangeItem[]) => {
    chunkIntoColumns([...entries].sort(byPinPosition), span).forEach((column, index) => {
      const shift = index * (layout.columnWidth + CARD_GAP);
      column.forEach((item, row) => {
        const panelLeft =
          side === "left" ? VIEW_MARGIN + shift : vw - RIGHT_MARGIN - shift - item.width;
        const real = { ...item, height: layout.realHeights.get(item.id) ?? item.height };
        offsets.set(item.id, offsetFor(real, panelLeft, VIEW_TOP_MARGIN + row * pitch));
      });
    });
  };
  place("left", layout.left);
  place("right", layout.right);
  return { offsets, scale, placedIds: new Set(visible.map((item) => item.id)) };
}
