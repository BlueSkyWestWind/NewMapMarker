import { fetchAllRows, type FetchPageResult } from "@/features/map-marker/api";
import { planReschedule } from "@/features/schedule/lib/cell-result";
import { toDbTimestamp, toKstLocal, type Freeze, type FreezeInput } from "@/features/schedule/lib/freeze";
import { addDays } from "@/features/schedule/lib/week";
import type { ImportPlan } from "@/features/schedule/lib/schedule-excel";
import { likePattern } from "@/features/schedule/lib/search-cells";
import {
  isNoCompanionColumnMissing,
  isResultColumnMissing,
} from "@/features/schedule/lib/table-missing";
import {
  isMarkColor,
  isResultStatus,
  isTextColor,
  type CellPosition,
  type CellResult,
  type MarkColor,
  type ScheduleCell,
  type ScheduleColumn,
  type ScheduleDayNote,
  type ScheduleMark,
  type ScheduleTextInput,
} from "@/features/schedule/types";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";

type Row = Record<string, unknown>;

export interface ScheduleRange {
  columns: ScheduleColumn[];
  cells: ScheduleCell[];
  dayNotes: ScheduleDayNote[];
  marks: ScheduleMark[];
}

function toColumn(row: Row): ScheduleColumn {
  return {
    id: String(row.id),
    sortOrder: Number(row.sort_order),
    teamLabel: String(row.team_label),
    leaderLabel: String(row.leader_label ?? ""),
  };
}

function toResult(row: Row): CellResult | null {
  if (!isResultStatus(row.result_status)) return null;
  return {
    status: row.result_status,
    reason: String(row.result_reason ?? ""),
    rescheduledTo: row.rescheduled_to ? String(row.rescheduled_to) : null,
  };
}

function toCell(row: Row): ScheduleCell {
  return {
    id: String(row.id),
    workDate: String(row.work_date),
    columnId: String(row.column_id),
    rowNo: Number(row.row_no),
    mainText: String(row.main_text ?? ""),
    subText: String(row.sub_text ?? ""),
    textColor: isTextColor(row.text_color) ? row.text_color : null,
    noCompanion: row.no_companion === true,
    result: toResult(row),
  };
}

const CELL_COLUMNS = "id, work_date, column_id, row_no, main_text, sub_text, text_color";
const RESULT_COLUMNS = "result_status, result_reason, rescheduled_to";
const COMPANION_COLUMNS = "no_companion";

export async function fetchScheduleColumns(
  supabase: SupabaseBrowserClient,
): Promise<ScheduleColumn[]> {
  const { data, error } = await supabase
    .from("schedule_columns")
    .select("id, sort_order, team_label, leader_label")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((row) => toColumn(row as Row));
}

export async function fetchScheduleCells(
  supabase: SupabaseBrowserClient,
  fromIso: string,
  toIso: string,
): Promise<ScheduleCell[]> {
  const fetchRows = (columns: string) =>
    fetchAllRows<Row>((from, to) =>
      supabase
        .from("schedule_cells")
        .select(columns, { count: "exact" })
        .gte("work_date", fromIso)
        .lte("work_date", toIso)
        .order("work_date")
        .order("column_id")
        .order("row_no")
        .range(from, to) as unknown as PromiseLike<FetchPageResult<Row>>,
    );
  // 마이그레이션 전이어도 일정표는 그대로 보여 준다. 없는 열을 하나씩 빼며 다시 읽는다.
  let withResult = true;
  let withCompanion = true;
  for (;;) {
    const columns = [
      CELL_COLUMNS,
      ...(withResult ? [RESULT_COLUMNS] : []),
      ...(withCompanion ? [COMPANION_COLUMNS] : []),
    ].join(", ");
    try {
      return (await fetchRows(columns)).map(toCell);
    } catch (error) {
      if (withCompanion && isNoCompanionColumnMissing(error)) withCompanion = false;
      else if (withResult && isResultColumnMissing(error)) withResult = false;
      else throw error;
    }
  }
}

/** 검색 결과의 최대 건수. 넘으면 오래된 쪽이 잘린다. */
export const SEARCH_RESULT_LIMIT = 200;

/**
 * 모든 날짜(과거 포함)에서 국소·작업 글에 `query`가 들어간 칸을 최근 날짜부터 찾는다.
 * 언제 시설했는지 찾을 때 쓴다. 입회·신호수 칸은 국소 글이 비어 있어 걸리지 않는다.
 */
export async function searchScheduleCells(
  supabase: SupabaseBrowserClient,
  query: string,
): Promise<ScheduleCell[]> {
  const run = async (columns: string) => {
    const { data, error } = await supabase
      .from("schedule_cells")
      .select(columns)
      .ilike("main_text", likePattern(query))
      .order("work_date", { ascending: false })
      .order("row_no")
      .limit(SEARCH_RESULT_LIMIT);
    if (error) throw error;
    return ((data ?? []) as unknown as Row[]).map(toCell);
  };
  try {
    return await run(`${CELL_COLUMNS}, ${RESULT_COLUMNS}`);
  } catch (error) {
    // 시행 결과 마이그레이션 전이면 결과 없이 찾는다.
    if (!isResultColumnMissing(error)) throw error;
    return run(CELL_COLUMNS);
  }
}

async function fetchScheduleDayNotes(
  supabase: SupabaseBrowserClient,
  fromIso: string,
  toIso: string,
): Promise<ScheduleDayNote[]> {
  const { data, error } = await supabase
    .from("schedule_days")
    .select("work_date, note")
    .gte("work_date", fromIso)
    .lte("work_date", toIso)
    .order("work_date");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    workDate: String(row.work_date),
    note: String(row.note),
  }));
}

async function fetchScheduleMarks(
  supabase: SupabaseBrowserClient,
  fromIso: string,
  toIso: string,
): Promise<ScheduleMark[]> {
  const { data, error } = await supabase
    .from("schedule_marks")
    .select("work_date, column_id, color")
    .gte("work_date", fromIso)
    .lte("work_date", toIso);
  if (error) throw error;
  const marks: ScheduleMark[] = [];
  for (const row of data ?? []) {
    if (!isMarkColor(row.color)) continue;
    marks.push({
      workDate: String(row.work_date),
      columnId: String(row.column_id),
      color: row.color,
    });
  }
  return marks;
}

/** 기간의 열·칸·날짜 메모·칸 색을 한 번에. 주간·월간 보기와 내보내기가 같이 쓴다. */
export async function fetchScheduleRange(
  supabase: SupabaseBrowserClient,
  fromIso: string,
  toIso: string,
): Promise<ScheduleRange> {
  const [columns, cells, dayNotes, marks] = await Promise.all([
    fetchScheduleColumns(supabase),
    fetchScheduleCells(supabase, fromIso, toIso),
    fetchScheduleDayNotes(supabase, fromIso, toIso),
    fetchScheduleMarks(supabase, fromIso, toIso),
  ]);
  return { columns, cells, dayNotes, marks };
}

export async function createScheduleCell(
  supabase: SupabaseBrowserClient,
  position: CellPosition,
  text: ScheduleTextInput,
): Promise<string> {
  const { data, error } = await supabase
    .from("schedule_cells")
    .insert({
    work_date: position.workDate,
    column_id: position.columnId,
    row_no: position.rowNo,
    main_text: text.mainText,
    sub_text: text.subText,
    text_color: text.textColor,
    ...(text.noCompanion !== undefined ? { no_companion: text.noCompanion } : {}),
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function updateScheduleCellText(
  supabase: SupabaseBrowserClient,
  id: string,
  text: ScheduleTextInput,
): Promise<void> {
  const { error } = await supabase
    .from("schedule_cells")
    .update({
      main_text: text.mainText,
      sub_text: text.subText,
      text_color: text.textColor,
      ...(text.noCompanion !== undefined ? { no_companion: text.noCompanion } : {}),
    })
    .eq("id", id);
  if (error) throw error;
}

/** 시행 결과를 저장한다. `null`이면 기록을 지운다(재일정 날짜도 함께 지워진다). */
export async function updateScheduleCellResult(
  supabase: SupabaseBrowserClient,
  id: string,
  result: CellResult | null,
): Promise<void> {
  const { error } = await supabase
    .from("schedule_cells")
    .update({
      result_status: result?.status ?? null,
      result_reason: result?.reason ?? "",
      rescheduled_to: result?.rescheduledTo ?? null,
    })
    .eq("id", id);
  if (error) throw error;
}

/**
 * 칸의 정보(국소·모국·장비·글자색)를 `targetDate`의 같은 팀 첫 빈 행에 복사한다.
 * 그 날짜의 칸은 보고 있는 기간 밖일 수 있어 여기서 따로 불러온다. 행이 가득 차면 던진다.
 */
export async function copyCellToDate(
  supabase: SupabaseBrowserClient,
  source: ScheduleCell,
  targetDate: string,
): Promise<void> {
  const targetCells = await fetchScheduleCells(supabase, targetDate, targetDate);
  const plan = planReschedule(targetCells, source, targetDate);
  if ("error" in plan) {
    throw new Error(`${targetDate}의 같은 팀 행이 가득 차서 복사할 수 없습니다.`);
  }
  await createScheduleCell(supabase, plan.position, plan.text);
}

/** 도착 자리가 차 있으면 맞바꾼다. `rowNo`가 null이면 그 날짜·열의 빈 행으로 보낸다. */
export async function moveScheduleCell(
  supabase: SupabaseBrowserClient,
  id: string,
  target: { workDate: string; columnId: string; rowNo: number | null },
): Promise<void> {
  const { error } = await supabase.rpc("move_schedule_cell", {
    p_cell_id: id,
    p_work_date: target.workDate,
    p_column_id: target.columnId,
    p_row_no: target.rowNo,
  });
  if (error) throw error;
}

export async function deleteScheduleCell(
  supabase: SupabaseBrowserClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("schedule_cells").delete().eq("id", id);
  if (error) throw error;
}

export async function updateScheduleColumn(
  supabase: SupabaseBrowserClient,
  id: string,
  input: { teamLabel: string; leaderLabel: string },
): Promise<void> {
  const { error } = await supabase
    .from("schedule_columns")
    .update({ team_label: input.teamLabel, leader_label: input.leaderLabel })
    .eq("id", id);
  if (error) throw error;
}

/** 날짜 메모 저장. 공백만 있으면 메모를 지운다. */
export async function saveScheduleDayNote(
  supabase: SupabaseBrowserClient,
  workDate: string,
  note: string,
): Promise<void> {
  const trimmed = note.trim();
  if (trimmed === "") {
    const { error } = await supabase.from("schedule_days").delete().eq("work_date", workDate);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("schedule_days")
    .upsert({ work_date: workDate, note: trimmed }, { onConflict: "work_date" });
  if (error) throw error;
}

/** 날짜 x 팀 칸 색 지정. `null`이면 색을 지운다. */
export async function setScheduleMark(
  supabase: SupabaseBrowserClient,
  workDate: string,
  columnId: string,
  color: MarkColor | null,
): Promise<void> {
  if (color === null) {
    const { error } = await supabase
      .from("schedule_marks")
      .delete()
      .eq("work_date", workDate)
      .eq("column_id", columnId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("schedule_marks")
    .upsert(
      { work_date: workDate, column_id: columnId, color },
      { onConflict: "work_date,column_id" },
    );
  if (error) throw error;
}

export interface ScheduleImportResult {
  /** 삽입한 칸 수 */
  count: number;
  /** 칸 교체는 끝났지만 일부 후속 반영(팀장 이름)이 실패했을 때의 안내. 없으면 null. */
  warning: string | null;
}

/**
 * 엑셀 가져오기 적용. 날짜 범위의 칸·날짜 메모·색 교체는 DB 함수 하나(한 트랜잭션)로 처리해
 * 실패하면 기존 일정이 그대로 남는다. 성공한 뒤에 팀장 이름을 반영한다(별도 호출).
 * 교체가 이미 끝났으므로 팀장 이름 반영이 실패해도 오류를 던지지 않고 `warning`으로 알린다.
 */
export async function applyScheduleImport(
  supabase: SupabaseBrowserClient,
  plan: ImportPlan,
): Promise<ScheduleImportResult> {
  const { data, error } = await supabase.rpc("replace_schedule_cells", {
    p_from: plan.deleteFrom,
    p_to: plan.deleteTo,
    p_cells: plan.inserts.map((insert) => ({
      work_date: insert.workDate,
      column_id: insert.columnId,
      row_no: insert.rowNo,
      main_text: insert.mainText,
      sub_text: insert.subText,
      text_color: insert.textColor,
    })),
    p_days: plan.days.map((day) => ({ work_date: day.workDate, note: day.note })),
    p_marks: plan.marks.map((mark) => ({
      work_date: mark.workDate,
      column_id: mark.columnId,
      color: mark.color,
    })),
  });
  if (error) throw error;

  const failures: string[] = [];
  for (const update of plan.columnUpdates) {
    const { error: leaderError } = await supabase
      .from("schedule_columns")
      .update({ leader_label: update.leaderLabel })
      .eq("id", update.id);
    if (leaderError) failures.push(leaderError.message);
  }
  return {
    count: typeof data === "number" ? data : plan.inserts.length,
    warning:
      failures.length > 0
        ? `팀장 이름 ${failures.length}건을 저장하지 못했습니다(${failures[0]}). 일정은 가져왔습니다.`
        : null,
  };
}

/**
 * 작업금지 기간 조회. `from`~`to`(`yyyy-mm-dd`, 한국 날짜)와 하루라도 겹치는 기간을 시작 순으로 돌려준다.
 * 둘 다 생략하면 전부다. 일정표 본 조회(`fetchScheduleRange`)와 따로 불러, 이 테이블이 아직 없어도 일정표는 열린다.
 */
export async function fetchScheduleFreezes(
  supabase: SupabaseBrowserClient,
  range: { from?: string; to?: string } = {},
): Promise<Freeze[]> {
  let query = supabase
    .from("schedule_freezes")
    .select("id, starts_at, ends_at, reason")
    .order("starts_at");
  if (range.from) query = query.gte("ends_at", `${range.from}T00:00:00+09:00`);
  if (range.to) query = query.lt("starts_at", `${addDays(range.to, 1)}T00:00:00+09:00`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    start: toKstLocal(String(row.starts_at)),
    end: toKstLocal(String(row.ends_at)),
    reason: String(row.reason),
  }));
}

export async function createScheduleFreeze(
  supabase: SupabaseBrowserClient,
  input: FreezeInput,
): Promise<void> {
  const { error } = await supabase.from("schedule_freezes").insert({
    starts_at: toDbTimestamp(input.start),
    ends_at: toDbTimestamp(input.end),
    reason: input.reason,
  });
  if (error) throw error;
}

export async function deleteScheduleFreeze(
  supabase: SupabaseBrowserClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from("schedule_freezes").delete().eq("id", id);
  if (error) throw error;
}
