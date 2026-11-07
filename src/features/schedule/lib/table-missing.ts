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

/**
 * 시행 결과 컬럼이 아직 없는지(결과 마이그레이션 전인지) 판별한다.
 * 42703 = Postgres "undefined_column". 이 경우 결과 없이 일정표를 계속 보여 준다.
 */
export function isResultColumnMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "42703") return true;
  if (typeof message !== "string") return false;
  return /result_status|result_reason|rescheduled_to/.test(message) && /does not exist|Could not find/i.test(message);
}
