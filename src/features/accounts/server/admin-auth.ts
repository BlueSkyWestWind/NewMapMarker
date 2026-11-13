import type { SupabaseClient, User } from "@supabase/supabase-js";
import { extractBearerToken } from "@/lib/api/verify-auth-token";
import { getSupabaseAdminClient, getSupabaseServerAnonClient } from "@/lib/supabase/admin";

export type AdminAuthResult =
  | { ok: true; user: User; adminClient: SupabaseClient }
  | { ok: false; status: number; error: string };

/**
 * 본인 계정에 대한 권한 해제 또는 삭제 시도를 방어한다.
 */
export function preventSelfAction(
  currentUserId: string,
  targetUserId: string,
  action: "delete" | "demote",
): { status: 400; error: string } | null {
  if (currentUserId !== targetUserId) return null;

  if (action === "delete") {
    return {
      status: 400,
      error: "본인 계정은 삭제할 수 없습니다.",
    };
  }

  return {
    status: 400,
    error: "본인 계정의 관리자 권한은 해제할 수 없습니다.",
  };
}

/**
 * 토큰으로 사용자 신원을 확인하고, 관리자 클라이언트로 app_admins 등록 여부를 검증한다.
 */
export async function validateAdminUser(
  token: string,
  anonClient: SupabaseClient,
  adminClient: SupabaseClient,
): Promise<{ ok: true; user: User } | { ok: false; status: number; error: string }> {
  const { data: authData, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !authData.user) {
    return {
      ok: false,
      status: 401,
      error: "유효하지 않거나 만료된 인증 토큰입니다.",
    };
  }

  // app_admins는 RLS가 걸려있으므로 adminClient로 조회해야 안정적으로 판별된다.
  const { data: adminRow, error: adminError } = await adminClient
    .from("app_admins")
    .select("user_id")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (adminError || !adminRow) {
    return {
      ok: false,
      status: 403,
      error: "관리자 권한이 없습니다.",
    };
  }

  return {
    ok: true,
    user: authData.user,
  };
}

/**
 * Next.js API Route Handler에서 호출하는 전체 관리자 인증 파이프라인.
 */
export async function authenticateAdminRequest(req: Request): Promise<AdminAuthResult> {
  const token = extractBearerToken(req);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "인증 헤더(Authorization: Bearer <token>)가 필요합니다.",
    };
  }

  try {
    const anonClient = getSupabaseServerAnonClient();
    const adminClient = getSupabaseAdminClient();

    const userCheck = await validateAdminUser(token, anonClient, adminClient);
    if (!userCheck.ok) {
      return userCheck;
    }

    return {
      ok: true,
      user: userCheck.user,
      adminClient,
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : "서버 인증 중 오류가 발생했습니다.",
    };
  }
}
