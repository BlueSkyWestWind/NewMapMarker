import { isValidIso, isValidMonth } from "@/features/schedule/lib/week";

export interface StoredViewState {
  facilityView: "week" | "month";
  dailyView: "day" | "archive";
  weekCount: number;
  monthCount: number;
  visibleOptionalColumnIds: string[];
}

export interface StoredDateState {
  selectedDate: string;
  weekStart: string;
  month: string;
}

export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export const VIEW_STATE_KEY = "schedule-view-v1";
export const DATE_STATE_KEY = "schedule-date-v1";

export const DEFAULT_VIEW_STATE: StoredViewState = {
  facilityView: "week",
  dailyView: "day",
  weekCount: 2,
  monthCount: 1,
  visibleOptionalColumnIds: [],
};

function defaultCopy(): StoredViewState {
  return { ...DEFAULT_VIEW_STATE, visibleOptionalColumnIds: [] };
}

function readRawJson(store: KeyValueStore | null, key: string): Record<string, unknown> | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 저장된 보기 상태(`localStorage`)를 읽는다. 저장소가 막혔거나 깨진 값이면 안전하게 기본값으로 돌아온다.
 */
export function loadViewState(
  store: KeyValueStore | null,
  validColumnIds: ReadonlySet<string>,
): StoredViewState {
  const parsed = readRawJson(store, VIEW_STATE_KEY);
  if (!parsed) return defaultCopy();

  const facilityView =
    parsed.facilityView === "week" || parsed.facilityView === "month"
      ? parsed.facilityView
      : DEFAULT_VIEW_STATE.facilityView;
  const dailyView =
    parsed.dailyView === "day" || parsed.dailyView === "archive"
      ? parsed.dailyView
      : DEFAULT_VIEW_STATE.dailyView;
  const weekCount =
    typeof parsed.weekCount === "number" &&
    Number.isInteger(parsed.weekCount) &&
    parsed.weekCount >= 1 &&
    parsed.weekCount <= 4
      ? parsed.weekCount
      : DEFAULT_VIEW_STATE.weekCount;
  const monthCount =
    typeof parsed.monthCount === "number" &&
    Number.isInteger(parsed.monthCount) &&
    parsed.monthCount >= 1 &&
    parsed.monthCount <= 3
      ? parsed.monthCount
      : DEFAULT_VIEW_STATE.monthCount;

  const visibleOptionalColumnIds: string[] = [];
  if (Array.isArray(parsed.visibleOptionalColumnIds)) {
    const seen = new Set<string>();
    for (const item of parsed.visibleOptionalColumnIds) {
      if (typeof item === "string" && validColumnIds.has(item) && !seen.has(item)) {
        seen.add(item);
        visibleOptionalColumnIds.push(item);
      }
    }
  }

  return {
    facilityView,
    dailyView,
    weekCount,
    monthCount,
    visibleOptionalColumnIds,
  };
}

/** 보기 상태를 저장한다. 저장소 예외는 조용히 무시한다. */
export function saveViewState(store: KeyValueStore | null, state: StoredViewState): void {
  if (!store) return;
  try {
    store.setItem(VIEW_STATE_KEY, JSON.stringify(state));
  } catch {
    // 사생활 보호 모드 등 저장소 차단은 무시한다.
  }
}

/**
 * 같은 날(`todayIso`)에 저장한 날짜·주·달 상태만 복원한다. 다른 날 저장분이나 깨진 값은 `null`.
 */
export function loadDateState(
  store: KeyValueStore | null,
  todayIso: string,
): StoredDateState | null {
  const parsed = readRawJson(store, DATE_STATE_KEY);
  if (!parsed) return null;
  if (parsed.savedOn !== todayIso) return null;
  if (
    typeof parsed.selectedDate !== "string" ||
    typeof parsed.weekStart !== "string" ||
    typeof parsed.month !== "string"
  ) {
    return null;
  }
  if (!isValidIso(parsed.selectedDate) || !isValidIso(parsed.weekStart) || !isValidMonth(parsed.month)) {
    return null;
  }
  return {
    selectedDate: parsed.selectedDate,
    weekStart: parsed.weekStart,
    month: parsed.month,
  };
}

/** 날짜 상태를 오늘 날짜(`savedOn`)와 함께 저장한다. 저장소 예외는 조용히 무시한다. */
export function saveDateState(
  store: KeyValueStore | null,
  state: StoredDateState,
  todayIso: string,
): void {
  if (!store) return;
  try {
    store.setItem(DATE_STATE_KEY, JSON.stringify({ ...state, savedOn: todayIso }));
  } catch {
    // 사생활 보호 모드 등 저장소 차단은 무시한다.
  }
}
