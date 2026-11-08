import { chunkArray } from "@/features/map-marker/lib/chunk";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";

const IN_CHUNK_SIZE = 100;

/** 삭제 권한이 없어(RLS) 행이 그대로 남았을 때의 오류. 이어서 insert하면 중복이 생기므로 중단한다. */
export class DeletePermissionError extends Error {
  constructor(table: string) {
    super(`삭제 권한이 없어 ${table} 정리를 중단했습니다. 관리자만 삭제할 수 있습니다.`);
    this.name = "DeletePermissionError";
  }
}

/**
 * `column`이 `values`에 속한 행을 지우고, 정말 지워졌는지 확인한다.
 * RLS가 DELETE를 거르면 오류 없이 0행만 지워지는데, "지우고 다시 넣는" 흐름에서는
 * 그 뒤의 insert가 중복 행을 만든다. 남은 행이 있으면 `DeletePermissionError`로 멈춘다.
 */
export async function deleteRowsGuarded(
  supabase: SupabaseBrowserClient,
  table: string,
  column: string,
  values: string[],
): Promise<void> {
  // .in()은 URL 쿼리로 나가므로 한 번에 많이 보내면 길이 제한에 걸린다.
  for (const part of chunkArray(values, IN_CHUNK_SIZE)) {
    const { error } = await supabase.from(table).delete().in(column, part);
    if (error) throw error;

    const { count, error: countError } = await supabase
      .from(table)
      .select(column, { count: "exact", head: true })
      .in(column, part);
    if (countError) throw countError;
    if (count && count > 0) throw new DeletePermissionError(table);
  }
}

/**
 * 테이블을 통째로 비운 뒤 정말 비었는지 확인한다(전체 복원용).
 * RLS가 삭제를 거르면 오류 없이 0행만 지워져, 이어지는 insert가 기존 행과 섞이거나 중복된다.
 */
export async function assertTableEmpty(
  supabase: SupabaseBrowserClient,
  table: string,
): Promise<void> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  if (count && count > 0) throw new DeletePermissionError(table);
}
