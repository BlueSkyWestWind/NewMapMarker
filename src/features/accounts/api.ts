import type { AdminUser, CreateAccountInput } from "./types";

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
 * 신규 계정 생성
 */
export async function createAdminUser(
  token: string,
  input: CreateAccountInput,
): Promise<AdminUser> {
  const res = await fetch("/api/admin/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  const data = await handleResponse<{ user: AdminUser }>(res);
  return data.user;
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
