import { buildDatedBackupFilename } from "@/features/map-marker/lib/excel/data-manager/full-backup-schema";
import { fetchFullBackupTables } from "@/features/map-marker/lib/fetch-full-backup-tables";
import { isSiteListsTableMissing } from "@/features/site-lists/lib/site-list-view";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";

export interface FullBackupFileResult {
  filename: string;
  headerCount: number;
  tables: {
    markers: number;
    information: number;
    erp_details: number;
    battery_markers: number;
    battery_specs: number;
  };
  /** 함께 백업한 국소 목록 수. 마이그레이션 전이면 null */
  siteListCount: number | null;
}

/**
 * 현재 DB 전체를 백업 엑셀로 내려받는다. 백업 버튼과 복원 전 안전 백업이 같이 쓴다.
 * 백업할 장비 데이터가 하나도 없으면 파일을 만들지 않고 null을 돌려준다
 * (빈 DB에서의 복원은 잃을 것이 없으므로 막지 않는다).
 */
export async function downloadFullBackupFile(
  supabase: SupabaseBrowserClient,
  baseName: string,
): Promise<FullBackupFileResult | null> {
  const MapMarkerExcelManager = (await import("@/features/map-marker/lib/excel/data-manager"))
    .default;
  const tables = await fetchFullBackupTables(supabase);
  if (!tables.erp_details.length && !tables.markers.length) return null;

  const filename = buildDatedBackupFilename(baseName);
  // 마이그레이션 전이면 목록 없이 백업한다.
  const siteListApi = await import("@/features/site-lists/api");
  const siteLists = await siteListApi.fetchSiteListBackup(supabase).catch((error: unknown) => {
    if (isSiteListsTableMissing(error)) return null;
    throw error;
  });

  const result = MapMarkerExcelManager.exportFullBackupToExcel(tables, filename, siteLists) as {
    headerCount: number;
    tables: FullBackupFileResult["tables"];
  };
  return {
    filename,
    headerCount: result.headerCount,
    tables: result.tables,
    siteListCount: siteLists ? siteLists.lists.length : null,
  };
}
