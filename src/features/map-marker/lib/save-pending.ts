import { chunkArray } from "@/features/map-marker/lib/chunk";
import { deleteRowsGuarded } from "@/features/map-marker/lib/guarded-delete";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";

type Row = Record<string, unknown>;

const DEFAULT_CHUNK_SIZE = 200;

/**
 * 같은 마커의 하위 행(시설정보·축전지 규격)을 지우고 다시 넣는다.
 * 이 테이블들은 marker_id에 유니크 키가 없어 upsert가 안 된다. 지우지 않고 넣으면
 * 중간 실패 뒤 재시도가 같은 행을 한 번 더 만든다.
 */
async function replaceChildRows(
  supabase: SupabaseBrowserClient,
  table: "information" | "battery_specs",
  rows: Row[],
  chunkSize: number,
) {
  for (const chunk of chunkArray(rows, chunkSize)) {
    const ids = [...new Set(chunk.map((row) => String(row.marker_id)))];
    await deleteRowsGuarded(supabase, table, "marker_id", ids);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw error;
  }
}

/** 대기 중인 장비 마커를 저장한다. 청크로 나누고 재시도해도 중복 키·중복 행이 생기지 않는다. */
export async function savePendingEquipment(
  supabase: SupabaseBrowserClient,
  input: { markers: Row[]; info: Row[] },
  chunkSize = DEFAULT_CHUNK_SIZE,
): Promise<void> {
  for (const chunk of chunkArray(input.markers, chunkSize)) {
    const { error } = await supabase.from("markers").upsert(chunk, { onConflict: "id" });
    if (error) throw error;
  }
  await replaceChildRows(supabase, "information", input.info, chunkSize);
}

/** 대기 중인 축전지 마커와 규격을 저장한다. 재시도해도 규격이 두 배가 되지 않는다. */
export async function savePendingBattery(
  supabase: SupabaseBrowserClient,
  input: { markers: Row[]; specs: Row[] },
  chunkSize = DEFAULT_CHUNK_SIZE,
): Promise<void> {
  for (const chunk of chunkArray(input.markers, chunkSize)) {
    const { error } = await supabase.from("battery_markers").upsert(chunk, { onConflict: "id" });
    if (error) throw error;
  }
  await replaceChildRows(supabase, "battery_specs", input.specs, chunkSize);
}
