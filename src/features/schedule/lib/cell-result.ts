import { firstFreeRow } from "@/features/schedule/lib/cell-grid";
import { isValidIso } from "@/features/schedule/lib/week";
import { resultLabel } from "@/features/schedule/types";
import type {
  CellPosition,
  CellResult,
  ResultStatus,
  ScheduleCell,
  ScheduleTextInput,
} from "@/features/schedule/types";

/** DB의 `result_reason` 길이 제한과 같다. */
export const REASON_MAX_LENGTH = 300;

export interface ResultInput {
  /** 고르지 않았으면 null(기록 지움) */
  status: ResultStatus | null;
  reason: string;
  /** 입력창 값. 비어 있으면 재일정 없음 */
  rescheduledTo: string;
  /** 이 칸의 날짜. 재일정은 이 날짜 이후여야 한다 */
  workDate: string;
}

export type ResultCheck =
  | { ok: true; value: CellResult | null }
  | { ok: false; error: "reason" | "reasonLength" | "date" };

/**
 * 시행 결과 입력을 검사해 저장할 값으로 만든다(순수 함수).
 * 완료는 사유·재일정을 버리고, 일부완료·미시설은 사유가 필수이며 재일정은 선택이다.
 */
export function validateResult(input: ResultInput): ResultCheck {
  if (input.status === null) return { ok: true, value: null };
  if (input.status === "done") {
    return { ok: true, value: { status: "done", reason: "", rescheduledTo: null } };
  }

  const reason = input.reason.trim();
  if (reason === "") return { ok: false, error: "reason" };
  if (reason.length > REASON_MAX_LENGTH) return { ok: false, error: "reasonLength" };

  const date = input.rescheduledTo.trim();
  if (date === "") {
    return { ok: true, value: { status: input.status, reason, rescheduledTo: null } };
  }
  // ISO 문자열은 사전순이 곧 날짜순이다.
  if (!isValidIso(date) || date <= input.workDate) return { ok: false, error: "date" };
  return { ok: true, value: { status: input.status, reason, rescheduledTo: date } };
}

export type ReschedulePlan =
  | { position: CellPosition; text: ScheduleTextInput }
  | { error: "full" };

/**
 * 다시 잡을 날짜에 복사할 칸의 자리와 내용. `targetCells`는 그 날짜의 칸들이다
 * (보고 있는 기간 밖일 수 있어 화면의 칸 목록이 아니라 따로 불러온 것을 넘긴다).
 * 같은 팀 열의 첫 빈 행에 놓고 시행 결과는 복사하지 않는다.
 */
export function planReschedule(
  targetCells: ScheduleCell[],
  source: ScheduleCell,
  targetDate: string,
): ReschedulePlan {
  const rowNo = firstFreeRow(targetCells, targetDate, source.columnId);
  if (rowNo === null) return { error: "full" };
  return {
    position: { workDate: targetDate, columnId: source.columnId, rowNo },
    text: {
      mainText: source.mainText,
      subText: source.subText,
      textColor: source.textColor,
    },
  };
}

/** 표 셀 툴팁에 붙일 한 줄 요약. 예: `미시설: 우천 → 11-12 재일정` */
export function resultSummary(result: CellResult): string {
  const parts = [result.reason ? `${resultLabel(result.status)}: ${result.reason}` : resultLabel(result.status)];
  if (result.rescheduledTo) parts.push(`→ ${result.rescheduledTo.slice(5)} 재일정`);
  return parts.join(" ");
}
