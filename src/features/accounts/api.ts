import type { CreateAccountResult } from "./lib/account-helpers";
import type { AuditEntry } from "./lib/audit-log";
import type { AdminUser, CreateAccountInput, LoginEvent } from "./types";

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as ApiErrorResponse;
    const errorMsg = errorBody.error || errorBody.message || `요청 실패 (${res.status})`;
    throw new Error(errorMsg);
  }
  return res.json() as Promise<T>;
}

/**
 * 관리자 전용 전체 계정 목록 조회
 */
export async function fetchAdminUsers(token: string): Promise<AdminUser[]> {
  const res = await fetch("/api/admin/users", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await handleResponse<{ users: AdminUser[] }>(res);
  return data.users;
}

/**
 * 계정의 로그인·로그아웃 기록(관리자 전용). 조회 함수가 아직 없으면 `available: false`.
 */
export async function fetchLoginHistory(
  token: string,
  userId: string,
): Promise<{ events: LoginEvent[]; available: boolean }> {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/history`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse<{ events: LoginEvent[]; available: boolean }>(res);
}

/**
 * 관리자 작업 기록(계정 생성·삭제·권한 변경, 관리자 전용). 테이블이 아직 없으면 `available: false`.
 */
export async function fetchAuditLog(token: string): Promise<{ entries: AuditEntry[]; available: boolean }> {
  const res = await fetch("/api/admin/audit", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse<{ entries: AuditEntry[]; available: boolean }>(res);
}

/**
 * 신규 계정 생성
 */
export async function createAdminUser(
  token: string,
  input: CreateAccountInput,
): Promise<CreateAccountResult> {
  const res = await fetch("/api/admin/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  return handleResponse<CreateAccountResult>(res);
}

/**
 * 관리자 권한 변경
 */
export async function updateAdminUserRole(
  token: string,
  userId: string,
  isAdmin: boolean,
): Promise<void> {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ isAdmin }),
  });

  await handleResponse<{ ok: boolean }>(res);
}

/**
 * 계정 삭제
 */
export async function deleteAdminUser(token: string, userId: string): Promise<void> {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  await handleResponse<{ ok: boolean }>(res);
}
