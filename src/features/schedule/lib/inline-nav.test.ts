import { describe, expect, it } from "vitest";
import { nextInlineTarget } from "@/features/schedule/lib/inline-nav";

const ROWS = ["r1", "r2", "r3"];
const COLS = ["c1", "c2", "c3"];

describe("nextInlineTarget", () => {
  it("① Tab: 같은 행의 다음 열로 이동한다", () => {
    expect(
      nextInlineTarget({
        rowKeys: ROWS,
        columnKeys: COLS,
        current: { rowKey: "r1", columnKey: "c1" },
        key: "Tab",
      }),
    ).toEqual({ rowKey: "r1", columnKey: "c2" });
  });

  it("② Tab: 행의 마지막 열이면 다음 행의 첫 열로 이동한다", () => {
    expect(
      nextInlineTarget({
        rowKeys: ROWS,
        columnKeys: COLS,
        current: { rowKey: "r1", columnKey: "c3" },
        key: "Tab",
      }),
    ).toEqual({ rowKey: "r2", columnKey: "c1" });
  });

  it("③ Tab: 마지막 행 마지막 열이면 null이다", () => {
    expect(
      nextInlineTarget({
        rowKeys: ROWS,
        columnKeys: COLS,
        current: { rowKey: "r3", columnKey: "c3" },
        key: "Tab",
      }),
    ).toBeNull();
  });

  it("④ Shift+Tab: 같은 행의 이전 열로 이동한다", () => {
    expect(
      nextInlineTarget({
        rowKeys: ROWS,
        columnKeys: COLS,
        current: { rowKey: "r2", columnKey: "c2" },
        key: "Shift+Tab",
      }),
    ).toEqual({ rowKey: "r2", columnKey: "c1" });
  });

  it("⑤ Shift+Tab: 행의 첫 열이면 이전 행의 마지막 열로 이동한다", () => {
    expect(
      nextInlineTarget({
        rowKeys: ROWS,
        columnKeys: COLS,
        current: { rowKey: "r2", columnKey: "c1" },
        key: "Shift+Tab",
      }),
    ).toEqual({ rowKey: "r1", columnKey: "c3" });
  });

  it("⑥ Shift+Tab: 첫 행 첫 열이면 null이다", () => {
    expect(
      nextInlineTarget({
        rowKeys: ROWS,
        columnKeys: COLS,
        current: { rowKey: "r1", columnKey: "c1" },
        key: "Shift+Tab",
      }),
    ).toBeNull();
  });

  it("⑦ Enter: 아래 행 같은 열로 이동한다", () => {
    expect(
      nextInlineTarget({
        rowKeys: ROWS,
        columnKeys: COLS,
        current: { rowKey: "r1", columnKey: "c2" },
        key: "Enter",
      }),
    ).toEqual({ rowKey: "r2", columnKey: "c2" });
  });

  it("⑧ Enter: 마지막 행이면 null이다", () => {
    expect(
      nextInlineTarget({
        rowKeys: ROWS,
        columnKeys: COLS,
        current: { rowKey: "r3", columnKey: "c2" },
        key: "Enter",
      }),
    ).toBeNull();
  });

  it("⑨ Shift+Enter: 위 행 같은 열로 이동한다", () => {
    expect(
      nextInlineTarget({
        rowKeys: ROWS,
        columnKeys: COLS,
        current: { rowKey: "r3", columnKey: "c2" },
        key: "Shift+Enter",
      }),
    ).toEqual({ rowKey: "r2", columnKey: "c2" });
  });

  it("⑩ Shift+Enter: 첫 행이면 null이다", () => {
    expect(
      nextInlineTarget({
        rowKeys: ROWS,
        columnKeys: COLS,
        current: { rowKey: "r1", columnKey: "c2" },
        key: "Shift+Enter",
      }),
    ).toBeNull();
  });

  it("⑪ 열이 하나뿐일 때 Tab은 다음 행의 그 열로 이동한다", () => {
    expect(
      nextInlineTarget({
        rowKeys: ROWS,
        columnKeys: ["only"],
        current: { rowKey: "r1", columnKey: "only" },
        key: "Tab",
      }),
    ).toEqual({ rowKey: "r2", columnKey: "only" });
  });

  it("⑫ 없는 행·열이나 빈 목록이면 예외 없이 null을 돌려준다", () => {
    expect(
      nextInlineTarget({
        rowKeys: ROWS,
        columnKeys: COLS,
        current: { rowKey: "missing", columnKey: "c1" },
        key: "Tab",
      }),
    ).toBeNull();
    expect(
      nextInlineTarget({
        rowKeys: ROWS,
        columnKeys: COLS,
        current: { rowKey: "r1", columnKey: "missing" },
        key: "Tab",
      }),
    ).toBeNull();
    expect(
      nextInlineTarget({
        rowKeys: [],
        columnKeys: COLS,
        current: { rowKey: "r1", columnKey: "c1" },
        key: "Tab",
      }),
    ).toBeNull();
    expect(
      nextInlineTarget({
        rowKeys: ROWS,
        columnKeys: [],
        current: { rowKey: "r1", columnKey: "c1" },
        key: "Tab",
      }),
    ).toBeNull();
  });
});
