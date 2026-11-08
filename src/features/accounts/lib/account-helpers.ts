import type { AdminUser } from "../types";
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

/** 계정 생성 요청의 결과. 관리자 권한 부여만 실패하면 `warning`이 채워진다. */
export interface CreateAccountResult {
  user: AdminUser;
  warning?: string;
}

/**
 * 계정 생성 결과를 화면 메시지로 바꾼다. 계정은 만들어졌어도 관리자 권한 부여가 실패했다면
 * 성공으로 덮지 않고 경고를 그대로 보여 준다(관리자가 만들어졌다고 믿으면 안 된다).
 */
export function describeCreateResult(result: CreateAccountResult): {
  text: string;
  type: "success" | "error";
  durationMs: number;
} {
  if (result.warning) {
    return { text: result.warning, type: "error", durationMs: 10000 };
  }
  return { text: "새 계정이 생성되었습니다.", type: "success", durationMs: 3500 };
}
