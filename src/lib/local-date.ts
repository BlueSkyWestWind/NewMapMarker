/**
 * 로컬 달력 기준 YYYY-MM-DD 문자열을 반환한다.
 * `toISOString` 기반 날짜 잘라내기는 UTC 기준이라 KST(UTC+9) 00:00~08:59에 전날 날짜가 나온다.
 */
export function localDateIso(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
