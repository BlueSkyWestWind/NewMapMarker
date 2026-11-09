import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/features/accounts/server/admin-auth";
import type { LoginEvent } from "@/features/accounts/types";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** 한 번에 읽는 최대 이벤트 수(DB 함수 상한 2000 이내). */
const HISTORY_LIMIT = 500;

/**
 * GET /api/admin/users/[id]/history: 계정의 로그인·로그아웃 기록(시각·IP)을 최근 순으로 돌려준다.
 * 조회 함수(마이그레이션)가 아직 없으면 `available: false`로 알린다. 관리자만 부를 수 있다.
 */
export async function GET(req: Request, { params }: RouteParams) {
  const auth = await authenticateAdminRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "대상 사용자 ID가 필요합니다." }, { status: 400 });
  }

  const { data, error } = await auth.adminClient.rpc("admin_user_login_history", {
    p_user_id: id,
    p_limit: HISTORY_LIMIT,
  });
  if (error) {
    // 함수가 없거나 호출할 수 없는 상태(마이그레이션 전)는 오류가 아니라 "아직 사용할 수 없음"이다.
    return NextResponse.json({ events: [] satisfies LoginEvent[], available: false });
  }

  const events: LoginEvent[] = ((data ?? []) as { occurred_at: string; action: string; ip: string | null }[])
    .filter((row) => row.action === "login" || row.action === "logout")
    .map((row) => ({ at: row.occurred_at, action: row.action as LoginEvent["action"], ip: row.ip ?? null }));

  return NextResponse.json({ events, available: true });
}
