/**
 * ISO 날짜 문자열을 "yyyy-MM-dd HH:mm" 형식으로 변환한다.
 */
export function formatAccountDateTime(isoString: string | null | undefined): string {
  if (!isoString) return "-";

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "-";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * 로그인한 사용자 ID와 대상 계정 ID가 동일한지 확인한다.
 */
export function isCurrentUser(
  currentUserId: string | null | undefined,
  targetUserId: string,
): boolean {
  if (!currentUserId) return false;
  return currentUserId === targetUserId;
}
