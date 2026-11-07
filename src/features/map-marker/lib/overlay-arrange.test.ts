import { describe, expect, it } from "vitest";
import { DEFAULT_OVERLAY_OFFSET, type OverlayPanelOffset } from "./overlay-drag";
import {
  arrangeOverlayPanels,
  boardFitPadding,
  panelRectOf,
  type ArrangeItem,
  type ArrangeRect,
} from "./overlay-arrange";

const VIEW = { viewportWidth: 1400, viewportHeight: 1100 };
const W = 340;
const H = 290;
const MARGIN = 12;
/** 오른쪽 열은 지도 컨트롤(줌·위치 버튼) 폭만큼 안쪽에 둔다 */
const RIGHT_MARGIN = 72;
const TOP_MARGIN = 52;

function item(id: string, x: number, y: number, extra: Partial<ArrangeItem> = {}): ArrangeItem {
  return { id, x, y, width: W, height: H, ...extra };
}

function overlapArea(a: ArrangeRect, b: ArrangeRect): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

function pinBox(x: number, y: number): ArrangeRect {
  return { left: x - 18, right: x + 18, top: y - 44, bottom: y + 8 };
}

type Arranged = ReturnType<typeof arrangeOverlayPanels>;

/** 계산 결과(오프셋·배율)로 화면에 놓일 실제 패널 사각형을 다시 구한다. */
function rectsOf(items: ArrangeItem[], arranged: Arranged) {
  return new Map(
    items.map((entry) => {
      const offset: OverlayPanelOffset =
        arranged.offsets.get(entry.id) ?? DEFAULT_OVERLAY_OFFSET;
      return [
        entry.id,
        panelRectOf(
          {
            x: entry.x,
            y: entry.y,
            width: entry.width * arranged.scale,
            height: entry.height * arranged.scale,
          },
          offset,
          { fixedGap: true },
        ),
      ] as const;
    }),
  );
}

function expectNoOverlapAndInside(
  items: ArrangeItem[],
  arranged: Arranged,
  { checkPins = true, viewportWidth = VIEW.viewportWidth } = {},
) {
  const rects = [...rectsOf(items, arranged).values()];
  for (const rect of rects) {
    expect(rect.left).toBeGreaterThanOrEqual(MARGIN - 1);
    expect(rect.top).toBeGreaterThanOrEqual(TOP_MARGIN - 1);
    expect(rect.right).toBeLessThanOrEqual(viewportWidth - MARGIN + 1);
    expect(rect.bottom).toBeLessThanOrEqual(VIEW.viewportHeight - MARGIN + 1);
  }
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      expect(overlapArea(rects[i], rects[j])).toBe(0);
    }
    if (!checkPins) continue;
    for (const pin of items) {
      expect(overlapArea(rects[i], pinBox(pin.x, pin.y))).toBe(0);
    }
  }
}

/** 모든 카드가 왼쪽 또는 오른쪽 가장자리 열에 붙어 있는지(가운데에 놓인 카드가 없는지) */
function expectOnlyEdgeColumns(
  items: ArrangeItem[],
  arranged: Arranged,
  viewportWidth = VIEW.viewportWidth,
) {
  for (const rect of rectsOf(items, arranged).values()) {
    const atLeft = Math.abs(rect.left - MARGIN) < 1;
    const atRight = Math.abs(rect.right - (viewportWidth - RIGHT_MARGIN)) < 1;
    expect(atLeft || atRight).toBe(true);
  }
}

describe("arrangeOverlayPanels (가장자리 열 배치)", () => {
  it("화면 왼쪽 절반의 핀은 왼쪽 가장자리 열에 놓는다", () => {
    const items = [item("a", 500, 600)];
    const arranged = arrangeOverlayPanels({ ...VIEW, items });
    expect(rectsOf(items, arranged).get("a")!.left).toBe(MARGIN);
    expectNoOverlapAndInside(items, arranged);
  });

  it("화면 오른쪽 절반의 핀은 오른쪽 가장자리 열에 놓는다", () => {
    const items = [item("a", 900, 600)];
    const arranged = arrangeOverlayPanels({ ...VIEW, items });
    expect(rectsOf(items, arranged).get("a")!.right).toBe(VIEW.viewportWidth - RIGHT_MARGIN);
  });

  it("국소가 적으면 줄이지 않는다(배율 1)", () => {
    const items = [item("a", 500, 600), item("b", 900, 600)];
    expect(arrangeOverlayPanels({ ...VIEW, items }).scale).toBe(1);
  });

  it("두 곳에 모인 국소는 각자 가까운 쪽 열에 세로로 쌓고 서로 겹치지 않는다", () => {
    const items = [
      item("a1", 560, 520),
      item("a2", 564, 522),
      item("a3", 558, 518),
      item("b1", 880, 640),
      item("b2", 884, 642),
    ];
    const arranged = arrangeOverlayPanels({ ...VIEW, items });
    const rects = rectsOf(items, arranged);
    for (const id of ["a1", "a2", "a3"]) expect(rects.get(id)!.left).toBe(MARGIN);
    for (const id of ["b1", "b2"]) {
      expect(rects.get(id)!.right).toBe(VIEW.viewportWidth - RIGHT_MARGIN);
    }
    expectNoOverlapAndInside(items, arranged);
  });

  it("같은 열에서는 핀이 위에 있는 국소가 위에 온다(연결선이 덜 꼬인다)", () => {
    const items = [item("low", 560, 800), item("high", 560, 300), item("mid", 560, 550)];
    const rects = rectsOf(items, arrangeOverlayPanels({ ...VIEW, items }));
    expect(rects.get("high")!.top).toBeLessThan(rects.get("mid")!.top);
    expect(rects.get("mid")!.top).toBeLessThan(rects.get("low")!.top);
  });

  it("왼쪽·오른쪽 열이 같은 높이에서 시작하고 카드 간격이 모두 같다(통일감)", () => {
    // 핀 높이가 제각각이어도 카드는 핀을 따라 흩어지지 않고 같은 줄에 가지런히 선다.
    const items = [
      item("l1", 500, 120),
      item("l2", 505, 400),
      item("l3", 510, 700),
      item("r1", 900, 300),
      item("r2", 905, 330),
      item("r3", 910, 900),
    ];
    const rects = rectsOf(items, arrangeOverlayPanels({ ...VIEW, items }));
    const tops = (prefix: string) =>
      [...rects.entries()]
        .filter(([id]) => id.startsWith(prefix))
        .map(([, rect]) => rect.top)
        .sort((a, b) => a - b);
    const left = tops("l");
    const right = tops("r");
    expect(left[0]).toBe(TOP_MARGIN);
    expect(right).toEqual(left);
    expect(left[1] - left[0]).toBeCloseTo(left[2] - left[1], 5);
  });

  it("카드 높이가 제각각이어도 모든 카드의 세로 간격(피치)은 같다", () => {
    const items = [
      item("a", 500, 200, { height: 250 }),
      item("b", 505, 300, { height: 290 }),
      item("c", 510, 400, { height: 270 }),
    ];
    const rects = rectsOf(items, arrangeOverlayPanels({ ...VIEW, items }));
    const tops = ["a", "b", "c"].map((id) => rects.get(id)!.top);
    expect(tops[1] - tops[0]).toBeCloseTo(tops[2] - tops[1], 5);
  });

  it("한쪽에 몰려도 반대쪽 열이 비어 있으면 나눠 담는다", () => {
    const items = [
      item("a1", 600, 200),
      item("a2", 602, 300),
      item("a3", 604, 400),
      item("a4", 606, 500),
    ];
    const arranged = arrangeOverlayPanels({ ...VIEW, items });
    const rects = [...rectsOf(items, arranged).values()];
    const atLeft = rects.filter((rect) => Math.abs(rect.left - MARGIN) < 1).length;
    const atRight = rects.filter(
      (rect) => Math.abs(rect.right - (VIEW.viewportWidth - RIGHT_MARGIN)) < 1,
    ).length;
    expect(atLeft + atRight).toBe(4);
    expect(Math.min(atLeft, atRight)).toBeGreaterThan(0);
    expectNoOverlapAndInside(items, arranged);
  });

  it("한 열에 다 안 들어가는 8개는 카드를 줄여서라도 가운데가 아닌 양쪽 가장자리 열에 모두 둔다", () => {
    // 높이 290짜리 4장은 열(1036px)에 안 들어가지만 약간만 줄이면 들어간다.
    const items = [
      ...[300, 420, 540, 660].map((y, index) => item(`l${index}`, 500 + index, y)),
      ...[300, 420, 540, 660].map((y, index) => item(`r${index}`, 900 + index, y)),
    ];
    const arranged = arrangeOverlayPanels({ ...VIEW, items });
    expect(arranged.scale).toBeLessThan(1);
    expect(arranged.scale).toBeGreaterThanOrEqual(0.7);
    expectOnlyEdgeColumns(items, arranged);
    expectNoOverlapAndInside(items, arranged);
  });

  it("국소가 더 많아 줄여도 한 열에 안 들어가면 안쪽에 열을 더하되 겹치지 않는다", () => {
    const wide = { viewportWidth: 1900, viewportHeight: VIEW.viewportHeight };
    const items = [
      ...Array.from({ length: 8 }, (_, index) => item(`l${index}`, 500 + index, 200 + index * 90)),
      ...Array.from({ length: 8 }, (_, index) => item(`r${index}`, 1400 + index, 200 + index * 90)),
    ];
    const arranged = arrangeOverlayPanels({ ...wide, items });
    expect(arranged.scale).toBeGreaterThanOrEqual(0.7);
    expectNoOverlapAndInside(items, arranged, {
      checkPins: false,
      viewportWidth: wide.viewportWidth,
    });
  });

  it("주어진 순서와 상관없이 같은 결과를 준다", () => {
    const items = [item("a", 560, 600), item("b", 564, 602), item("c", 900, 300)];
    const forward = arrangeOverlayPanels({ ...VIEW, items });
    const reversed = arrangeOverlayPanels({ ...VIEW, items: [...items].reverse() });
    expect(reversed.scale).toBe(forward.scale);
    for (const entry of items) {
      expect(reversed.offsets.get(entry.id)).toEqual(forward.offsets.get(entry.id));
    }
  });

  it("화면 밖 핀은 기본 위치로 둔다", () => {
    const items = [item("a", -500, 100)];
    expect(arrangeOverlayPanels({ ...VIEW, items }).offsets.get("a")).toEqual(
      DEFAULT_OVERLAY_OFFSET,
    );
  });

  it("화면이 너무 작아도 모든 국소의 위치를 돌려준다", () => {
    const items = [item("a", 100, 100), item("b", 120, 110)];
    const arranged = arrangeOverlayPanels({ viewportWidth: 300, viewportHeight: 200, items });
    expect([...arranged.offsets.keys()].sort()).toEqual(["a", "b"]);
  });
});

describe("boardFitPadding", () => {
  it("좌우에는 카드 열이 들어갈 만큼, 위아래에는 가장자리 여백만 둔다", () => {
    const padding = boardFitPadding();
    expect(padding.left).toBeGreaterThan(W);
    expect(padding.right).toBeGreaterThanOrEqual(padding.left);
    expect(padding.top).toBeGreaterThan(0);
    expect(padding.top).toBeLessThan(padding.left);
  });
});

describe("panelRectOf", () => {
  it("기본 위치는 패널 아랫변이 핀 위쪽에 오고 가운데 정렬이다", () => {
    const rect = panelRectOf(item("a", 500, 500), DEFAULT_OVERLAY_OFFSET);
    expect(rect.left + W / 2).toBe(500);
    expect(rect.bottom).toBeLessThan(500);
  });
});
