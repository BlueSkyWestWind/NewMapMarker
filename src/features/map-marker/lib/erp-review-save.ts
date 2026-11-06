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

/** 공정 정보를 지우고 다시 넣는다. 삭제 실패를 무시하면 중복 행이 생기므로 중단한다. */
async function replaceProcessRows(
  supabase: SupabaseBrowserClient,
  rows: StagedErpRow[],
) {
  for (const ids of chunk(rows.map((row) => row.id), DELETE_CHUNK_SIZE)) {
    for (const table of ["erp_details", "information"] as const) {
      const { error } = await supabase.from(table).delete().in("marker_id", ids);
      if (error) throw error;
    }
  }
  for (const batch of chunk(rows.map((row) => row.info), INFO_CHUNK_SIZE)) {
    const { error } = await supabase.from("information").insert(batch);
    if (error) throw error;
  }
  for (const batch of chunk(rows.map((row) => row.erp), ERP_CHUNK_SIZE)) {
    const { error } = await supabase.from("erp_details").insert(batch);
    if (error) throw error;
  }
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
  await replaceProcessRows(supabase, rows);
}
