import { fetchAllRows, type FetchPageResult } from "@/features/map-marker/api";
import {
  FULL_BACKUP_TABLE_NAMES,
  type FullBackupTables,
} from "@/features/map-marker/lib/excel/data-manager/full-backup-schema";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";

type Row = Record<string, unknown>;

/**
 * 전체 백업용으로 모든 테이블의 모든 행을 읽는다.
 *
 * 복원은 기존 데이터를 지우고 파일 내용을 다시 넣으므로, 잘린 백업은 복원할 때 데이터를 잃는다.
 * 그래서 다 받았는지 총 건수와 대조하고, 모자라면 파일을 만들지 않고 중단한다.
 */
export async function fetchFullBackupTables(
  supabase: SupabaseBrowserClient,
): Promise<FullBackupTables> {
  const entries = await Promise.all(
    FULL_BACKUP_TABLE_NAMES.map(async (name) => {
      let total: number | null = null;
      const rows = await fetchAllRows<Row>(async (from, to) => {
        // 페이지 경계가 흔들리지 않도록 유일 키로 정렬한다.
        const result = (await supabase
          .from(name)
          .select("*", { count: "exact" })
          .order("id")
          .range(from, to)) as unknown as FetchPageResult<Row>;
        total = result.count;
        return result;
      });
      if (total !== null && rows.length !== total) {
        throw new Error(
          `${name} 테이블을 ${rows.length}건만 읽었습니다(전체 ${total}건). 잘린 파일을 만들지 않도록 백업을 중단했습니다. 다시 시도해 주세요.`,
        );
      }
      return [name, rows] as const;
    }),
  );
  return Object.fromEntries(entries) as FullBackupTables;
}
