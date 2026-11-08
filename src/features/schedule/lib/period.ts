import {
  planCrossTeamCreate,
  type CrossTeamCompanion,
  type CrossTeamEntry,
  type CrossTeamPlan,
} from "@/features/schedule/lib/cross-team";
import { holidayName } from "@/features/schedule/lib/holidays";
import { addDays, isValidIso, weekdayLabel } from "@/features/schedule/lib/week";
import type { ScheduleCell } from "@/features/schedule/types";

/** 기간 등록의 최대 길이. 시작일로부터 이 일수까지(종료일 포함)만 허용한다. */
export const MAX_PERIOD_DAYS = 31;

export type PeriodDates =
  | { dates: string[]; skipped: { date: string; reason: "weekend" | "holiday" }[] }
  | { error: "invalid" | "reversed" | "too-long" };

/**
 * 시작일 **다음 날부터** 종료일까지의 날짜를 구한다(순수 함수).
 * 시작일은 칸 편집 창에서 이미 저장하는 날짜라 포함하지 않는다.
 * 기본은 토·일·공휴일을 제외하고 제외한 날짜와 이유를 함께 돌려준다.
 * 특이한 경우 `includeOffDays`로 모두 포함한다.
 */
export function expandPeriodDates(input: {
  startIso: string;
  endIso: string;
  includeOffDays: boolean;
}): PeriodDates {
  const { startIso, endIso, includeOffDays } = input;
  if (!isValidIso(startIso) || !isValidIso(endIso)) return { error: "invalid" };
  if (endIso < startIso) return { error: "reversed" };

  const dates: string[] = [];
  const skipped: { date: string; reason: "weekend" | "holiday" }[] = [];
  let count = 0;
  for (let date = addDays(startIso, 1); date <= endIso; date = addDays(date, 1)) {
    count += 1;
    if (count > MAX_PERIOD_DAYS) return { error: "too-long" };
    const label = weekdayLabel(date);
    if (!includeOffDays && (label === "토" || label === "일")) {
      skipped.push({ date, reason: "weekend" });
    } else if (!includeOffDays && holidayName(date) !== null) {
      skipped.push({ date, reason: "holiday" });
    } else {
      dates.push(date);
    }
  }
  return { dates, skipped };
}

/** 기간 등록할 국소. `endIso`가 없으면 기간 없이 그 날 하루만이라 여기서는 건너뛴다. */
export type PeriodEntry = CrossTeamEntry & { endIso: string | null };

export interface PeriodPlan {
  /** 만들 칸. 각 `position.workDate`가 만들 날짜다 */
  creates: CrossTeamPlan["creates"];
  /** 건너뛴 항목(이미 있음·행 부족). 날짜를 함께 적는다 */
  skipped: { date: string; columnId: string; reason: "full" | "duplicate"; mainText: string }[];
  /** 주말·공휴일이라 제외한 날짜 */
  skippedDates: { date: string; reason: "weekend" | "holiday" }[];
  /** 계획 대상이 된 날짜(적용할 항목이 하나라도 있는 날) */
  dates: string[];
}

/**
 * 국소별 기간 등록 계획(순수 함수). 시작일 다음 날부터 가장 늦은 종료일까지 날짜를 구하고,
 * 날짜마다 그 날짜까지 이어지는 국소를 `planCrossTeamCreate`로 팀별 빈 행에 배정한다.
 * 같은 국소·입회·신호수가 이미 있으면 건너뛰어 다시 저장해도 중복이 생기지 않는다.
 * 종료일 오류는 어떤 칸도 계획하기 전에 돌려준다(저장 도중이 아니라 시작 전에 막으려고).
 */
export function planPeriodCreate(input: {
  /** 시작일 이후 날짜의 칸을 포함해야 한다(보고 있는 기간 밖일 수 있어 따로 불러온다) */
  cells: ScheduleCell[];
  startIso: string;
  targetColumnIds: string[];
  entries: PeriodEntry[];
  companions: CrossTeamCompanion[];
  includeOffDays: boolean;
}): PeriodPlan | { error: "invalid" | "reversed" | "too-long" } {
  const withPeriod = input.entries.filter(
    (entry) => entry.endIso !== null && entry.mainText.trim() !== "",
  ) as (PeriodEntry & { endIso: string })[];
  if (withPeriod.length === 0) return { creates: [], skipped: [], skippedDates: [], dates: [] };

  const maxEnd = withPeriod.reduce((max, entry) => (entry.endIso > max ? entry.endIso : max), "");
  // 항목마다 종료일을 검사한다. 형식이 틀린 것·이른 것이 하나라도 있으면 시작 전에 막는다.
  for (const entry of withPeriod) {
    const check = expandPeriodDates({
      startIso: input.startIso,
      endIso: entry.endIso,
      includeOffDays: input.includeOffDays,
    });
    if ("error" in check) return check;
  }
  const range = expandPeriodDates({
    startIso: input.startIso,
    endIso: maxEnd,
    includeOffDays: input.includeOffDays,
  });
  if ("error" in range) return range;

  const plan: PeriodPlan = { creates: [], skipped: [], skippedDates: range.skipped, dates: [] };
  for (const date of range.dates) {
    const active = withPeriod.filter((entry) => entry.endIso >= date);
    if (active.length === 0) continue;
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

