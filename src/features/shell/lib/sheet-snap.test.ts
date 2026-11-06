import { describe, expect, it } from "vitest";
import {
  nearestSheetSnap,
  nextSheetSnap,
  sheetHeightPx,
  sheetSnapOnNavigate,
  SHEET_PEEK_PX,
} from "./sheet-snap";

const AREA = 700;

describe("sheetHeightPx", () => {
  it("낮음은 고정, 절반과 전체는 지도 영역 기준이다", () => {
    expect(sheetHeightPx("peek", AREA)).toBe(SHEET_PEEK_PX);
    expect(sheetHeightPx("half", AREA)).toBe(350);
    expect(sheetHeightPx("full", AREA)).toBe(692);
  });
});

describe("nearestSheetSnap", () => {
  it("놓은 높이에서 가장 가까운 단계를 고른다", () => {
    expect(nearestSheetSnap(100, AREA)).toBe("peek");
    expect(nearestSheetSnap(300, AREA)).toBe("half");
    expect(nearestSheetSnap(600, AREA)).toBe("full");
  });

  it("범위를 벗어나도 양 끝 단계로 맞춘다", () => {
    expect(nearestSheetSnap(-50, AREA)).toBe("peek");
    expect(nearestSheetSnap(5000, AREA)).toBe("full");
  });
});

describe("nextSheetSnap", () => {
  it("손잡이를 누르면 낮음 → 절반 → 전체 → 낮음 순서다", () => {
    expect(nextSheetSnap("peek")).toBe("half");
    expect(nextSheetSnap("half")).toBe("full");
    expect(nextSheetSnap("full")).toBe("peek");
  });
});

describe("sheetSnapOnNavigate", () => {
  it("다른 메뉴로 가면 절반이다", () => {
    expect(sheetSnapOnNavigate({ nav: "map", isSameTab: false, current: "peek" })).toBe("half");
  });

  it("활성 탭을 다시 누르면 낮음이고, 이미 낮음이면 절반이다", () => {
    expect(sheetSnapOnNavigate({ nav: "map", isSameTab: true, current: "full" })).toBe("peek");
    expect(sheetSnapOnNavigate({ nav: "map", isSameTab: true, current: "peek" })).toBe("half");
  });

  it("지도가 없는 바코드/QR은 전체다", () => {
    expect(sheetSnapOnNavigate({ nav: "barcode", isSameTab: false, current: "peek" })).toBe("full");
  });
});
