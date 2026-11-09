import { NextResponse } from "next/server";
import { clientIpOf } from "@/features/accounts/lib/audit-log";
import { authenticateAdminRequest } from "@/features/accounts/server/admin-auth";
import { recordAudit } from "@/features/accounts/server/audit";
import type { AdminSession } from "@/features/accounts/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users: 전체 계정 목록과 관리자 권한 여부를 반환한다.
 */
export async function GET(req: Request) {
  const auth = await authenticateAdminRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { adminClient } = auth;

  try {
    const [{ data: userData, error: usersError }, { data: adminRows, error: adminsError }] =
      await Promise.all([
        adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        adminClient.from("app_admins").select("user_id"),
      ]);

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }
    if (adminsError) {
      return NextResponse.json({ error: adminsError.message }, { status: 500 });
    }

    const adminIds = new Set((adminRows ?? []).map((row) => row.user_id));

    // 접속 정보(IP·브라우저·마지막 활동). 마이그레이션 전이면 함수가 없어 실패하므로 목록은 그대로 돌려주고 접속 정보만 뺀다.
    const { data: sessionRows, error: sessionsError } = await adminClient.rpc("admin_user_sessions");
    const sessionsByUser = new Map<string, AdminSession[]>();
    if (!sessionsError) {
      for (const row of (sessionRows ?? []) as {
        user_id: string;
        session_id: string;
        ip: string | null;
        user_agent: string | null;
        created_at: string;
        last_active_at: string;
      }[]) {
        const list = sessionsByUser.get(row.user_id) ?? [];
        list.push({
          id: row.session_id,
          ip: row.ip ?? null,
          userAgent: row.user_agent ?? null,
          createdAt: row.created_at,
          lastActiveAt: row.last_active_at,
        });
        sessionsByUser.set(row.user_id, list);
      }
    }

    const users = (userData?.users ?? []).map((user) => ({
      id: user.id,
      email: user.email ?? "",
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      isAdmin: adminIds.has(user.id),
      ...(sessionsError ? null : { sessions: sessionsByUser.get(user.id) ?? [] }),
    }));

    // 가입일 내림차순 정렬 (최신 계정 먼저)
    users.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ users });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "계정 목록 조회 실패" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/users: 신규 계정을 생성하고 옵션에 따라 관리자 권한을 부여한다.
 */
export async function POST(req: Request) {
  const auth = await authenticateAdminRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { adminClient } = auth;

  try {
    const body = (await req.json().catch(() => null)) as {
      email?: string;
      password?: string;
      isAdmin?: boolean;
    } | null;

    if (!body || !body.email || !body.password) {
      return NextResponse.json(
        { error: "이메일과 비밀번호를 모두 입력해야 합니다." },
        { status: 400 },
      );
    }

    const trimmedEmail = body.email.trim();
    if (!trimmedEmail.includes("@")) {
      return NextResponse.json(
        { error: "올바른 이메일 형식이 아닙니다." },
        { status: 400 },
      );
    }

    if (body.password.length < 6) {
      return NextResponse.json(
        { error: "비밀번호는 최소 6자리 이상이어야 합니다." },
        { status: 400 },
      );
    }

    const { data: created, error: createError } =
      await adminClient.auth.admin.createUser({
        email: trimmedEmail,
        password: body.password,
        email_confirm: true,
      });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    if (!created.user) {
      return NextResponse.json(
        { error: "계정 생성 결과가 없습니다." },
        { status: 500 },
      );
    }

    // 계정은 이미 만들어졌다. 관리자 권한 부여만 실패하면 같은 모양의 user(일반 계정)와
    // 경고를 함께 돌려준다 — 클라이언트가 207을 성공으로만 처리해 경고가 사라지던 문제.
    let warning: string | undefined;
    if (body.isAdmin === true) {
      const { error: insertAdminError } = await adminClient
        .from("app_admins")
        .insert({ user_id: created.user.id });

      if (insertAdminError) {
        warning = `계정은 생성되었으나 관리자 권한 부여에 실패했습니다: ${insertAdminError.message}`;
      }
    }

    await recordAudit(adminClient, {
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      action: "account_create",
      targetId: created.user.id,
      targetEmail: created.user.email ?? trimmedEmail,
      detail: { isAdmin: body.isAdmin === true, ...(warning ? { warning } : {}) },
      ip: clientIpOf(req.headers),
    });

    return NextResponse.json(
      {
        user: {
          id: created.user.id,
          email: created.user.email ?? trimmedEmail,
          createdAt: created.user.created_at,
          lastSignInAt: null,
          isAdmin: body.isAdmin === true && !warning,
        },
        ...(warning ? { warning } : {}),
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "계정 생성 실패" },
      { status: 500 },
    );
  }
}
