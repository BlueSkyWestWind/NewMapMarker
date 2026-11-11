import {
  deleteProjectRowsGuarded,
  deleteRowsGuarded,
} from "@/features/map-marker/lib/guarded-delete";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import type { StagedErpRow } from "@/features/map-marker/types/marker";

const DELETE_CHUNK_SIZE = 100;
const MARKER_CHUNK_SIZE = 200;
const INFO_CHUNK_SIZE = 200;
const ERP_CHUNK_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function insertProcessRows(
  supabase: SupabaseBrowserClient,
  rows: StagedErpRow[],
) {
  for (const batch of chunk(rows.map((row) => row.info), INFO_CHUNK_SIZE)) {
    const { error } = await supabase.from("information").insert(batch);
    if (error) throw error;
  }
  for (const batch of chunk(rows.map((row) => row.erp), ERP_CHUNK_SIZE)) {
    const { error } = await supabase.from("erp_details").insert(batch);
    if (error) throw error;
  }
}

/** 공정 정보를 지우고 다시 넣는다. 삭제 실패를 무시하면 중복 행이 생기므로 중단한다. */
async function replaceProcessRows(
  supabase: SupabaseBrowserClient,
  rows: StagedErpRow[],
) {
  for (const ids of chunk(rows.map((row) => row.id), DELETE_CHUNK_SIZE)) {
    for (const table of ["erp_details", "information"] as const) {
      // 삭제가 권한 때문에 막히면 뒤의 insert가 중복 행을 만들므로 여기서 멈춘다.
      await deleteRowsGuarded(supabase, table, "marker_id", ids);
    }
  }
  await insertProcessRows(supabase, rows);
}

const projectOf = (row: StagedErpRow) => String(row.info.project_code ?? "").trim();

/**
 * 같은 마커의 다른 사업 행(신설·부대장비증설 등)을 지키려고, 프로젝트코드가 있는 행은
 * 같은 프로젝트의 행만 지우고 다시 넣는다. 프로젝트코드가 빈 행은 마커의 행을 모두 교체한다.
 */
async function replaceProcessRowsByProject(
  supabase: SupabaseBrowserClient,
  rows: StagedErpRow[],
) {
  const scoped = rows.filter((row) => projectOf(row));
  for (const row of scoped) {
    for (const table of ["erp_details", "information"] as const) {
      const column = table === "information" ? "project_code" : "project";
      await deleteProjectRowsGuarded(supabase, table, column, row.id, projectOf(row));
    }
  }
  const whole = rows.filter((row) => !projectOf(row));
  if (whole.length > 0) {
    await replaceProcessRows(supabase, whole);
  }
  await insertProcessRows(supabase, scoped);
}

/**
 * 사용자가 확인한 한 건을 저장한다.
 * 신규는 같은 ID가 이미 있으면(다른 곳에서 먼저 등록) 덮어쓰지 않는다.
 * 좌표 없는 기존 건은 행에 담긴 열과 좌표만 갱신된다.
 */
export async function saveReviewRow(
  supabase: SupabaseBrowserClient,
  row: StagedErpRow,
  coords: { lat: number; lng: number },
) {
  const isNew = row.kind === "new";
  const { error } = await supabase.from("markers").upsert(
    {
      ...row.marker,
      ...coords,
      ...(isNew ? { created_at: new Date().toISOString() } : {}),
    },
    isNew ? { onConflict: "id", ignoreDuplicates: true } : { onConflict: "id" },
  );
  if (error) throw error;
  await replaceProcessRows(supabase, [row]);
}

/** 기존 건의 국소명과 공정 정보만 갱신한다. 마커 행에 없는 열은 그대로 유지된다. */
export async function refreshExistingRows(
  supabase: SupabaseBrowserClient,
  rows: StagedErpRow[],
) {
  if (rows.length === 0) return;
  for (const batch of chunk(rows.map((row) => row.marker), MARKER_CHUNK_SIZE)) {
    const { error } = await supabase
      .from("markers")
      .upsert(batch, { onConflict: "id" });
    if (error) throw error;
  }
  await replaceProcessRowsByProject(supabase, rows);
}

/**
 * 같은 통합시설코드·사업연도인데 프로젝트코드가 다른 사업(추가 건)을 같은 마커의 상세 행으로 덧붙인다.
 * 마커와 기존 상세 행은 건드리지 않는다.
 */
export async function addAddonRows(
  supabase: SupabaseBrowserClient,
  rows: StagedErpRow[],
) {
  if (rows.length === 0) return;
  await insertProcessRows(supabase, rows);
}
