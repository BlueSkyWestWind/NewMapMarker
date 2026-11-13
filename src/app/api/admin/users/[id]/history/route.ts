import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/features/accounts/server/admin-auth";
import { toLoginEvents, type LoginHistoryRow } from "@/features/accounts/lib/login-history";
import type { LoginEvent } from "@/features/accounts/types";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** 한 번에 읽는 최대 이벤트 수. */
const HISTORY_LIMIT = 500;

/**
 * GET /api/admin/users/[id]/history: 계정의 로그인·로그아웃 기록(시각·IP·브라우저)을 최근 순으로 돌려준다.
 * 원본은 `public.login_history`(auth.sessions 트리거가 기록). 테이블이 아직 없으면 `available: false`로 알린다.
 * 관리자만 부를 수 있다.
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

  const { data, error } = await auth.adminClient
    .from("login_history")
    .select("occurred_at, action, ip, user_agent")
    .eq("user_id", id)
    .order("occurred_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) {
    // 테이블이 없는 상태(마이그레이션 전)는 오류가 아니라 "아직 사용할 수 없음"이다.
    return NextResponse.json({ events: [] satisfies LoginEvent[], available: false });
  }

  return NextResponse.json({ events: toLoginEvents((data ?? []) as LoginHistoryRow[]), available: true });
}
