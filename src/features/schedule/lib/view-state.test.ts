import { describe, expect, it } from "vitest";
import {
  DATE_STATE_KEY,
  DEFAULT_VIEW_STATE,
  loadDateState,
  loadViewState,
  saveDateState,
  saveViewState,
  VIEW_STATE_KEY,
  type KeyValueStore,
  type StoredDateState,
  type StoredViewState,
} from "./view-state";

function makeMemoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

function makeThrowingStore(): KeyValueStore {
  return {
    getItem: () => {
      throw new Error("SecurityError: storage blocked");
    },
    setItem: () => {
      throw new Error("QuotaExceededError: storage blocked");
    },
  };
}

describe("view-state", () => {
  const validCols = new Set(["col-a", "col-b", "col-c"]);

  it("저장 후 불러오면 같은 보기 상태를 돌려준다", () => {
    const store = makeMemoryStore();
    const state: StoredViewState = {
      facilityView: "month",
      dailyView: "archive",
      weekCount: 4,
      monthCount: 3,
      visibleOptionalColumnIds: ["col-a", "col-c"],
    };
    saveViewState(store, state);
    expect(loadViewState(store, validCols)).toEqual(state);
  });

  it("저장소가 null이거나 예외를 던져도 기본값을 돌려주고 저장은 조용히 무시한다", () => {
    const throwing = makeThrowingStore();
    expect(() => saveViewState(null, DEFAULT_VIEW_STATE)).not.toThrow();
    expect(() => saveViewState(throwing, DEFAULT_VIEW_STATE)).not.toThrow();
    expect(loadViewState(null, validCols)).toEqual(DEFAULT_VIEW_STATE);
    expect(loadViewState(throwing, validCols)).toEqual(DEFAULT_VIEW_STATE);

    expect(() =>
      saveDateState(throwing, { selectedDate: "2026-11-15", weekStart: "2026-11-09", month: "2026-11" }, "2026-11-15"),
    ).not.toThrow();
    expect(loadDateState(null, "2026-11-15")).toBeNull();
    expect(loadDateState(throwing, "2026-11-15")).toBeNull();
  });

  it("깨진 JSON이 들어 있으면 기본값을 돌려준다", () => {
    const store = makeMemoryStore({
      [VIEW_STATE_KEY]: "{not-valid-json",
      [DATE_STATE_KEY]: "[]",
    });
    expect(loadViewState(store, validCols)).toEqual(DEFAULT_VIEW_STATE);
    expect(loadDateState(store, "2026-11-15")).toBeNull();
  });

  it("범위 밖 값이나 잘못된 열거형은 해당 키만 기본값으로 고친다", () => {
    const store = makeMemoryStore({
      [VIEW_STATE_KEY]: JSON.stringify({
        facilityView: "x",
        dailyView: "archive",
        weekCount: 9,
        monthCount: 2,
        visibleOptionalColumnIds: ["col-b"],
      }),
    });
    expect(loadViewState(store, validCols)).toEqual({
      facilityView: DEFAULT_VIEW_STATE.facilityView,
      dailyView: "archive",
      weekCount: DEFAULT_VIEW_STATE.weekCount,
      monthCount: 2,
      visibleOptionalColumnIds: ["col-b"],
    });
  });

  it("visibleOptionalColumnIds는 validColumnIds에 있는 것만 남긴다", () => {
    const store = makeMemoryStore({
      [VIEW_STATE_KEY]: JSON.stringify({
        facilityView: "week",
        dailyView: "day",
        weekCount: 2,
        monthCount: 1,
        visibleOptionalColumnIds: ["col-a", "deleted-col", 123, "col-c", "col-a"],
      }),
    });
    expect(loadViewState(store, validCols).visibleOptionalColumnIds).toEqual(["col-a", "col-c"]);
  });

  it("loadDateState는 같은 날 저장분만 돌려주고 savedOn이 다르면 null을 돌려준다", () => {
    const store = makeMemoryStore();
    const dateState: StoredDateState = {
      selectedDate: "2026-11-18",
      weekStart: "2026-11-16",
      month: "2026-11",
    };
    saveDateState(store, dateState, "2026-11-15");
    expect(loadDateState(store, "2026-11-15")).toEqual(dateState);
    expect(loadDateState(store, "2026-11-16")).toBeNull();
  });
});
