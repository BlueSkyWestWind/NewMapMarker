/**
 * 시설일정 도메인 타입.
 * `workDate`는 항상 `yyyy-mm-dd` 문자열이다. `Date`를 상태나 DB 경계에 넘기지 않는다(시간대 오류 방지).
 */

/** 글자색: 파랑(축전지수거) / 빨강. 6자리 대문자 RGB, '#' 없음. */
export const TEXT_COLORS = ["0070C0", "FF0000"] as const;
export type TextColor = (typeof TEXT_COLORS)[number];

/** 날짜 x 팀 칸 색 5가지. 6자리 대문자 RGB, '#' 없음. */
export const MARK_COLORS = ["D9F2D0", "F2CFEE", "4E95D9", "FF5050", "D1D1D1"] as const;
export type MarkColor = (typeof MARK_COLORS)[number];

export interface ScheduleColumn {
  id: string;
  sortOrder: number;
  teamLabel: string;
  leaderLabel: string;
}

/** 당일 시행 결과: 완료 / 일부완료 / 미시설. 기록하지 않은 칸은 결과가 없다. */
export const RESULT_STATUSES = ["done", "partial", "undone"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

export interface CellResult {
  status: ResultStatus;
  /** 일부완료·미시설이면 필수. 완료는 빈 문자열 */
  reason: string;
  /** 다시 잡은 날짜(yyyy-mm-dd). 정보를 그 날짜에 복사한 뒤 남긴다 */
  rescheduledTo: string | null;
}

export interface ScheduleCell {
  id: string;
  workDate: string;
  columnId: string;
  rowNo: number;
  mainText: string;
  subText: string;
  textColor: TextColor | null;
  /** 시행 결과. 없으면 아직 기록하지 않았다 */
  result?: CellResult | null;
}

export interface CellPosition {
  workDate: string;
  columnId: string;
  rowNo: number;
}

export interface ScheduleTextInput {
  mainText: string;
  subText: string;
  textColor: TextColor | null;
}

export interface ScheduleDayNote {
  workDate: string;
  note: string;
}

export interface ScheduleMark {
  workDate: string;
  columnId: string;
  color: MarkColor;
}

export function isMarkColor(value: unknown): value is MarkColor {
  return typeof value === "string" && (MARK_COLORS as readonly string[]).includes(value);
}

export function isResultStatus(value: unknown): value is ResultStatus {
  return typeof value === "string" && (RESULT_STATUSES as readonly string[]).includes(value);
}

export function isTextColor(value: unknown): value is TextColor {
  return typeof value === "string" && (TEXT_COLORS as readonly string[]).includes(value);
}

const MARK_LABELS: Record<MarkColor, string> = {
  D9F2D0: "중장비",
  F2CFEE: "승주",
  "4E95D9": "K대응",
  FF5050: "빨강 칸",
  D1D1D1: "회색 칸",
};

const TEXT_COLOR_LABELS: Record<TextColor, string> = {
  "0070C0": "축전지수거",
  FF0000: "빨강 글자",
};

/** 범례에 이름이 있는 색은 그 이름, 없는 색은 색 이름. */
export function markLabel(color: MarkColor): string {
  return MARK_LABELS[color];
}

export function textColorLabel(color: TextColor): string {
  return TEXT_COLOR_LABELS[color];
}

const RESULT_LABELS: Record<ResultStatus, string> = {
  done: "완료",
  partial: "일부완료",
  undone: "미시설",
};

export function resultLabel(status: ResultStatus): string {
  return RESULT_LABELS[status];
}

/** 화면용 글자색. 어두운 배경에서도 읽히게 밝게 잡았다. 엑셀 파일에는 원래 색을 쓴다. */
export const TEXT_COLOR_DISPLAY: Record<TextColor, string> = {
  "0070C0": "#38A1F5",
  FF0000: "#FF6B6B",
};
