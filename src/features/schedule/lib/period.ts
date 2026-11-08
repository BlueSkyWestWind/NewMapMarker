import {
  planCrossTeamCreate,
  type CrossTeamCompanion,
  type CrossTeamEntry,
  type CrossTeamPlan,
} from "@/features/schedule/lib/cross-team";
import { isValidIso } from "@/features/schedule/lib/week";
import type { ScheduleCell } from "@/features/schedule/types";

/** 한 국소에 고를 수 있는 작업일자의 최대 개수. */
export const MAX_WORK_DATES = 31;

/** 작업일자를 고른 국소. `dates`가 비면 지금 날짜 하루만이라 여기서는 건너뛴다. */
export type WorkDatesEntry = CrossTeamEntry & { dates: string[] };

export interface WorkDatesPlan {
  /** 만들 칸. 각 `position.workDate`가 만들 날짜다 */
  creates: CrossTeamPlan["creates"];
  /** 건너뛴 항목(이미 있음·행 부족). 날짜를 함께 적는다 */
  skipped: { date: string; columnId: string; reason: "full" | "duplicate"; mainText: string }[];
  /** 계획 대상이 된 날짜(적용할 항목이 하나라도 있는 날), 날짜 순서 */
  dates: string[];
}

/**
 * 사용자가 직접 고른 작업일자에 국소를 만드는 계획(순수 함수).
 * 고른 날짜마다 그 날짜를 고른 국소만 `planCrossTeamCreate`로 팀별 빈 행에 배정한다.
 * 토·일·공휴일도 직접 고르면 그대로 만든다(거르지 않는다).
 * 이미 있는 국소·입회·신호수는 건너뛰어 다시 저장해도 중복이 생기지 않는다.
 *
 * - `startIso`(칸 편집 창의 날짜)는 창이 따로 저장하므로 고른 날짜에서 뺀다.
 * - 한 항목의 날짜가 형식이 틀리면 `invalid`, 31개를 넘으면 `too-many`를 돌려준다.
 *   어떤 칸도 계획하기 전에 돌려줘서, 저장 도중이 아니라 시작 전에 막을 수 있다.
 */
export function planWorkDatesCreate(input: {
  /** 고른 날짜들의 칸을 포함해야 한다(보고 있는 기간 밖일 수 있어 따로 불러온다) */
  cells: ScheduleCell[];
  startIso: string;
  targetColumnIds: string[];
  entries: WorkDatesEntry[];
  companions: CrossTeamCompanion[];
}): WorkDatesPlan | { error: "invalid" | "too-many" } {
  const withDates: (WorkDatesEntry & { dates: string[] })[] = [];
  for (const entry of input.entries) {
    if (entry.mainText.trim() === "") continue;
    const unique = [...new Set(entry.dates)].filter((date) => date !== input.startIso);
    if (unique.some((date) => !isValidIso(date))) return { error: "invalid" };
    if (unique.length > MAX_WORK_DATES) return { error: "too-many" };
    if (unique.length > 0) withDates.push({ ...entry, dates: unique });
  }

  const plan: WorkDatesPlan = { creates: [], skipped: [], dates: [] };
  const allDates = [...new Set(withDates.flatMap((entry) => entry.dates))].sort();
  for (const date of allDates) {
    const active = withDates.filter((entry) => entry.dates.includes(date));
    plan.dates.push(date);
    const day = planCrossTeamCreate({
      cells: input.cells,
      workDate: date,
      targetColumnIds: input.targetColumnIds,
      entries: active,
      companions: input.companions,
    });
    plan.creates.push(...day.creates);
    plan.skipped.push(...day.skipped.map((item) => ({ ...item, date })));
  }
  return plan;
}
