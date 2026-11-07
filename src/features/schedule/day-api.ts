import { fetchAllRows, type FetchPageResult } from "@/features/map-marker/api";
import { archiveSearchText, latestPerStation } from "@/features/schedule/lib/day-archive";
import { erpRowToRef, type ErpRefRow } from "@/features/schedule/lib/day-reference";
import { stationKey } from "@/features/schedule/lib/day-stations";
import {
  DAY_COLUMN_KEYS,
  OPTION_LIST_KEYS,
  REF_KEYS,
  type ArchiveRow,
  type DayDetail,
  type DayValues,
  type OptionListKey,
  type OptionLists,
  type RefValues,
} from "@/features/schedule/lib/day-types";
import { cloneOptionLists, OPTION_LIST_SEEDS } from "@/features/schedule/lib/option-lists";
import { likePattern } from "@/features/schedule/lib/search-cells";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";

/** 일자별·누적 조회의 react-query 키 접두사. 일정표 본 조회(`facility-schedule`)와 겹치지 않는다. */
export const DAY_QUERY_KEY = ["facility-schedule-day"] as const;

type Row = Record<string, unknown>;

/** 목록 값의 최대 길이(`schedule_option_lists.value`의 CHECK와 같다). */
const OPTION_VALUE_MAX_LENGTH = 100;
/** 누적 조회의 기본 최대 건수. */
export const DEFAULT_ARCHIVE_LIMIT = 500;

/** 문자열이 아니면 `null`. 빈 글은 "지정 안 함"이 아니라 "빈칸"이라 그대로 둔다. */
function textOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

// ---------------------------------------------------------------------
// 공정관리(erp_details) 참조
// ---------------------------------------------------------------------

const ERP_COLUMNS =
  "id, station_final, facility_code, project, method, biz_category, region_sigungu, equip_final, realty_type, equip_location, address_full, raw";

/**
 * 국소 이름(`erp_details.station_final`과 글자까지 같아야 찾는다)으로 공정관리 참조 값을 찾는다.
 * 키는 `stationKey(station_final)`. 같은 국소가 여러 행이면 id가 가장 큰(최근 등록) 행을 쓴다.
 */
export async function fetchErpRefs(
  supabase: SupabaseBrowserClient,
  sites: string[],
): Promise<Map<string, RefValues>> {
  const names = [...new Set(sites.map((site) => site.trim()).filter((site) => site !== ""))];
  const refs = new Map<string, RefValues>();
  if (names.length === 0) return refs;

  const rows = await fetchAllRows<Row>(
    (from, to) =>
      supabase
        .from("erp_details")
        .select(ERP_COLUMNS, { count: "exact" })
        .in("station_final", names)
        .order("id")
        .range(from, to) as unknown as PromiseLike<FetchPageResult<Row>>,
  );

  const newest = new Map<string, { id: number; row: Row }>();
  for (const row of rows) {
    if (typeof row.station_final !== "string") continue;
    const key = stationKey(row.station_final);
    const id = Number(row.id);
    const current = newest.get(key);
    if (!current || id > current.id) newest.set(key, { id, row });
  }
  for (const [key, { row }] of newest) refs.set(key, erpRowToRef(row as unknown as ErpRefRow));
  return refs;
}

// ---------------------------------------------------------------------
// 일자별 상세 입력(schedule_day_details)
// ---------------------------------------------------------------------

const DETAIL_COLUMNS =
  "work_date, station_key, site, work_category, level_label, work_time, work_type, equipment, work_content, work_detail, worker, witness, signaler, overrides";

/** jsonb `overrides`에서 참조 열 이름에 글 값인 것만 남긴다. */
function toOverrides(value: unknown): RefValues {
  const overrides: RefValues = {};
  if (!value || typeof value !== "object") return overrides;
  const source = value as Row;
  for (const key of REF_KEYS) {
    const item = source[key];
    if (typeof item === "string") overrides[key] = item;
  }
  return overrides;
}

function toDetail(row: Row): DayDetail {
  return {
    workDate: String(row.work_date),
    stationKey: String(row.station_key),
    site: String(row.site ?? ""),
    workCategory: textOrNull(row.work_category),
    levelLabel: textOrNull(row.level_label),
    workTime: textOrNull(row.work_time),
    workType: textOrNull(row.work_type),
    equipment: textOrNull(row.equipment),
    workContent: textOrNull(row.work_content),
    workDetail: textOrNull(row.work_detail),
    worker: textOrNull(row.worker),
    witness: textOrNull(row.witness),
    signaler: textOrNull(row.signaler),
    overrides: toOverrides(row.overrides),
  };
}

function fromDetail(detail: DayDetail): Row {
  // 값이 빠진 칸(undefined)만 null로 두고, 글(빈 글 포함)은 그대로 보낸다.
  return {
    work_date: detail.workDate,
    station_key: detail.stationKey,
    site: detail.site,
    work_category: detail.workCategory ?? null,
    level_label: detail.levelLabel ?? null,
    work_time: detail.workTime ?? null,
    work_type: detail.workType ?? null,
    equipment: detail.equipment ?? null,
    work_content: detail.workContent ?? null,
    work_detail: detail.workDetail ?? null,
    worker: detail.worker ?? null,
    witness: detail.witness ?? null,
    signaler: detail.signaler ?? null,
    overrides: detail.overrides ?? {},
  };
}

export async function fetchDayDetails(
  supabase: SupabaseBrowserClient,
  workDate: string,
): Promise<DayDetail[]> {
  const { data, error } = await supabase
    .from("schedule_day_details")
    .select(DETAIL_COLUMNS)
    .eq("work_date", workDate);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map(toDetail);
}

export async function upsertDayDetails(
  supabase: SupabaseBrowserClient,
  details: DayDetail[],
): Promise<void> {
  if (details.length === 0) return;
  const { error } = await supabase
    .from("schedule_day_details")
    .upsert(details.map(fromDetail), { onConflict: "work_date,station_key" });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// 드롭다운 목록(schedule_option_lists)
// ---------------------------------------------------------------------

function isOptionListKey(value: unknown): value is OptionListKey {
  return (OPTION_LIST_KEYS as readonly unknown[]).includes(value);
}

function emptyLists(): OptionLists {
  return Object.fromEntries(OPTION_LIST_KEYS.map((key) => [key, [] as string[]])) as unknown as OptionLists;
}

/** 표가 비어 있으면(마이그레이션 직후가 아니라 값을 전부 지운 경우도 포함) 처음 값을 돌려준다. */
export async function fetchOptionLists(supabase: SupabaseBrowserClient): Promise<OptionLists> {
  const { data, error } = await supabase
    .from("schedule_option_lists")
    .select("list_key, value, sort_order")
    .order("sort_order");
  if (error) throw error;

  const rows = ((data ?? []) as unknown as Row[]).filter(
    (row) => isOptionListKey(row.list_key) && typeof row.value === "string",
  );
  if (rows.length === 0) {
    return cloneOptionLists(OPTION_LIST_SEEDS);
  }

  const lists = emptyLists();
  const ordered = [...rows].sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  for (const row of ordered) lists[row.list_key as OptionListKey].push(String(row.value));
  return lists;
}

/**
 * 키(`value`)가 원문 그대로 기본키라 앞뒤 공백을 지운 값만 넣고 지운다.
 * 공백뿐이거나 길이를 넘는 값은 DB를 부르기 전에 거절한다.
 */
function cleanOptionValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") throw new Error("목록에 추가할 값을 입력하세요.");
  if (trimmed.length > OPTION_VALUE_MAX_LENGTH) {
    throw new Error(`목록 값은 ${OPTION_VALUE_MAX_LENGTH}자 이하로 입력하세요.`);
  }
  return trimmed;
}

/** 목록 끝에 값을 더한다. 이미 있는 값이면 아무 일도 하지 않는다. */
export async function addOption(
  supabase: SupabaseBrowserClient,
  key: OptionListKey,
  value: string,
): Promise<void> {
  const trimmed = cleanOptionValue(value);
  const { data, error: lastError } = await supabase
    .from("schedule_option_lists")
    .select("sort_order")
    .eq("list_key", key)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (lastError) throw lastError;
  const last = (data as unknown as Row[] | null)?.[0]?.sort_order;
  const sortOrder = last === undefined || last === null ? 0 : Number(last) + 1;

  const { error } = await supabase
    .from("schedule_option_lists")
    .upsert(
      { list_key: key, value: trimmed, sort_order: sortOrder },
      { onConflict: "list_key,value", ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function deleteOption(
  supabase: SupabaseBrowserClient,
  key: OptionListKey,
  value: string,
): Promise<void> {
  const trimmed = cleanOptionValue(value);
  const { error } = await supabase
    .from("schedule_option_lists")
    .delete()
    .eq("list_key", key)
    .eq("value", trimmed);
  if (error) throw error;
}

// ---------------------------------------------------------------------
// 누적(schedule_archive_rows)
// ---------------------------------------------------------------------

const ARCHIVE_COLUMNS = "work_date, station_key, site, row_values, saved_at";

/** 저장된 jsonb에서 24열을 모두 가진 `DayValues`를 만든다. 글이 아닌 값은 빈 글. */
function toDayValues(value: unknown): DayValues {
  const source = value && typeof value === "object" ? (value as Row) : {};
  return Object.fromEntries(
    DAY_COLUMN_KEYS.map((key) => [key, typeof source[key] === "string" ? source[key] : ""]),
  ) as DayValues;
}

function toArchiveRow(row: Row): ArchiveRow {
  return {
    workDate: String(row.work_date),
    stationKey: String(row.station_key),
    site: String(row.site ?? ""),
    values: toDayValues(row.row_values),
    savedAt: String(row.saved_at ?? ""),
  };
}

/** PostgREST `in.(...)` 값 목록. 쉼표·괄호·따옴표가 있어도 깨지지 않게 항목마다 따옴표로 감싼다. */
function inList(values: readonly string[]): string {
  const quoted = values.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `(${quoted.join(",")})`;
}

/**
 * 그날 누적을 `rows`로 바꾼다: upsert한 뒤 그 밖의(일정에서 빠진 국소의) 그날 행을 지운다.
 * 행이 없으면 아무것도 하지 않는다 — 일정을 아직 올리지 않은 날의 누적을 통째로 지우지 않기 위해서다.
 */
export async function saveArchiveRows(
  supabase: SupabaseBrowserClient,
  workDate: string,
  rows: ArchiveRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("schedule_archive_rows").upsert(
    rows.map((row) => ({
      work_date: workDate,
      station_key: row.stationKey,
      site: row.site,
      row_values: row.values,
      search_text: archiveSearchText(row.values),
      // saved_at·saved_by는 보내지 않는다: INSERT는 기본값이, 다시 저장(UPDATE)은 DB 트리거가 채운다.
    })),
    { onConflict: "work_date,station_key" },
  );
  if (error) throw error;

  const { error: deleteError } = await supabase
    .from("schedule_archive_rows")
    .delete()
    .eq("work_date", workDate)
    .not("station_key", "in", inList(rows.map((row) => row.stationKey)));
  if (deleteError) throw deleteError;
}

/** 작업일 내림차순. `text`는 `search_text`(국소·프로젝트·통합시설코드)에 포함 검색한다. */
export async function fetchArchive(
  supabase: SupabaseBrowserClient,
  filter: { from?: string; to?: string; text?: string },
  limit: number = DEFAULT_ARCHIVE_LIMIT,
): Promise<ArchiveRow[]> {
  let query = supabase
    .from("schedule_archive_rows")
    .select(ARCHIVE_COLUMNS)
    .order("work_date", { ascending: false })
    .order("station_key");
  if (filter.from) query = query.gte("work_date", filter.from);
  if (filter.to) query = query.lte("work_date", filter.to);
  const text = filter.text?.trim();
  if (text) query = query.ilike("search_text", likePattern(text));
  const { data, error } = await query.limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map(toArchiveRow);
}

/**
 * 국소(`stationKey`)마다 작업일이 가장 최근인 누적 행.
 * `beforeDate`를 주면 그 날짜보다 **앞선**(같은 날 제외) 행만 본다 — 보고 있는 날 자신의 저장본이
 * 참조가 되지 않게 하려고 일자별 보기가 고른 날짜를 넘긴다.
 */
export async function fetchLatestArchive(
  supabase: SupabaseBrowserClient,
  stationKeys: string[],
  beforeDate?: string,
): Promise<Map<string, ArchiveRow>> {
  const keys = [...new Set(stationKeys)];
  if (keys.length === 0) return new Map();
  const rows = await fetchAllRows<Row>((from, to) => {
    let query = supabase
      .from("schedule_archive_rows")
      .select(ARCHIVE_COLUMNS, { count: "exact" })
      .in("station_key", keys);
    if (beforeDate) query = query.lt("work_date", beforeDate);
    return query
      .order("work_date", { ascending: false })
      .order("station_key")
      .range(from, to) as unknown as PromiseLike<FetchPageResult<Row>>;
  });
  return latestPerStation(rows.map(toArchiveRow));
}

export async function deleteArchiveRows(
  supabase: SupabaseBrowserClient,
  rows: { workDate: string; stationKey: string }[],
): Promise<void> {
  const byDate = new Map<string, string[]>();
  for (const row of rows) {
    const keys = byDate.get(row.workDate) ?? [];
    keys.push(row.stationKey);
    byDate.set(row.workDate, keys);
  }
  for (const [workDate, keys] of byDate) {
    const { error } = await supabase
      .from("schedule_archive_rows")
      .delete()
      .eq("work_date", workDate)
      .in("station_key", keys);
    if (error) throw error;
  }
}
