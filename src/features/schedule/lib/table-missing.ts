/**
 * 시설일정 테이블이 아직 없는지(마이그레이션 전인지) 판별한다.
 * 42P01 = Postgres "undefined_table", PGRST205 = PostgREST "스키마 캐시에 테이블 없음".
 */
export function isScheduleTableMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "42P01" || code === "PGRST205") return true;
  if (typeof message !== "string") return false;
  return message.includes("schedule_") && /does not exist|Could not find/i.test(message);
}
