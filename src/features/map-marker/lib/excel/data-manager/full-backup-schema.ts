/**
 * 전체 백업의 테이블 목록·타입·파일명 규칙.
 *
 * `full-backup.ts`는 xlsx(SheetJS, 1MB+)를 정적으로 끌어온다.
 * 백업 훅은 여기 있는 상수·타입만 필요한데 같은 모듈에 두면 SheetJS 전체가
 * 홈 첫 로딩 번들에 실린다. 그래서 **xlsx에 의존하지 않는 부분만** 분리해 둔다.
 */

export const FULL_BACKUP_TABLE_NAMES = [
  'markers',
  'information',
  'erp_details',
  'battery_markers',
  'battery_specs',
] as const;

export type FullBackupTableName = (typeof FULL_BACKUP_TABLE_NAMES)[number];

export type FullBackupTables = Record<FullBackupTableName, Record<string, unknown>[]>;

/** `20260726_전체백업.xlsx` 형태의 날짜 접두 파일명 */
export function buildDatedBackupFilename(baseName: string): string {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const safeBase = baseName.replace(/\.xlsx$/i, '');
  return `${yyyy}${mm}${dd}_${safeBase}.xlsx`;
}
