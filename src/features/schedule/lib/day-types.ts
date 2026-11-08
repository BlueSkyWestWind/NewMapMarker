/** 일자별 상세(14장)·목록·누적이 함께 쓰는 타입과 상수. */

/** 드롭다운 목록 이름(`schedule_option_lists.list_key`). */
export const OPTION_LIST_KEYS = [
  "bizClass",
  "bizKind",
  "constructionType",
  "workCategory",
  "workTime",
  "workType",
  "equipment",
  "workContent",
] as const;
export type OptionListKey = (typeof OPTION_LIST_KEYS)[number];
export type OptionLists = Record<OptionListKey, string[]>;

/** 공정관리·누적·마커에서 가져와 자동으로 채우는 열(덮어쓰기 대상). */
export const REF_KEYS = [
  "project",
  "facilityCode",
  "bizClass",
  "bizKind",
  "constructionType",
  "region",
  "equipType",
  "address",
  "motherStation",
  "realtyType",
  "equipLocation",
] as const;
export type RefKey = (typeof REF_KEYS)[number];
export type RefValues = Partial<Record<RefKey, string>>;
/** 자동 값을 찾은 곳: 공정관리(erp_details) · 누적 · 마커·정보. */
export type RefSource = "erp" | "archive" | "marker";

/** 상세표 24열(엑셀 A~X 순서). */
export const DAY_COLUMN_KEYS = [
  "seq",
  "project",
  "facilityCode",
  "bizClass",
  "bizKind",
  "constructionType",
  "workCategory",
  "region",
  "site",
  "equipType",
  "workDate",
  "address",
  "motherStation",
  "worker",
  "witness",
  "signaler",
  "realtyType",
  "equipLocation",
  "levelLabel",
  "workTime",
  "workType",
  "equipment",
  "workContent",
  "workDetail",
] as const;
export type DayColumnKey = (typeof DAY_COLUMN_KEYS)[number];
export type DayValues = Record<DayColumnKey, string>;

/** 사용자가 입력한 상세(`schedule_day_details` 한 행). `null` = 지정 안 함 → 기본값/자동값. */
export interface DayDetail {
  workDate: string;
  stationKey: string;
  site: string;
  workCategory: string | null;
  levelLabel: string | null;
  workTime: string | null;
  workType: string | null;
  equipment: string | null;
  workContent: string | null;
  workDetail: string | null;
  worker: string | null;
  witness: string | null;
  signaler: string | null;
  overrides: RefValues;
  /** 일정에 없는 국소를 일자별 표에 직접 추가한 행이면 true(없으면 false로 본다) */
  isManual?: boolean;
}

export type DayDetailPatch = Partial<Omit<DayDetail, "workDate" | "stationKey" | "site">>;

/** 입력하지 않았을 때 쓰는 기본값. */
export const DAY_DEFAULTS = {
  workCategory: "HW",
  levelLabel: "Level1",
  workTime: "주간",
} as const;

/** 누적 한 행(`schedule_archive_rows`): 저장 당시 24열 값 그대로. */
export interface ArchiveRow {
  workDate: string;
  stationKey: string;
  site: string;
  values: DayValues;
  savedAt: string;
}
