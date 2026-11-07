import { NextResponse } from "next/server";
import {
  authenticateAdminRequest,
  preventSelfAction,
} from "@/features/accounts/server/admin-auth";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/admin/users/[id]: 계정의 관리자 권한을 부여하거나 회수한다.
 */
export async function PATCH(req: Request, { params }: RouteParams) {
  const auth = await authenticateAdminRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "대상 사용자 ID가 필요합니다." }, { status: 400 });
  }

  try {
    const body = (await req.json().catch(() => null)) as {
      isAdmin?: boolean;
    } | null;

    if (body === null || typeof body.isAdmin !== "boolean") {
      return NextResponse.json(
        { error: "isAdmin(boolean) 필드가 필요합니다." },
        { status: 400 },
      );
    }

    // 본인 계정의 관리자 권한을 회수하려는 경우 차단
    if (!body.isAdmin) {
      const selfCheck = preventSelfAction(auth.user.id, id, "demote");
      if (selfCheck) {
        return NextResponse.json(
          { error: selfCheck.error },
          { status: selfCheck.status },
        );
      }
    }

    const { adminClient } = auth;

    if (body.isAdmin) {
      const { error: upsertError } = await adminClient
        .from("app_admins")
        .upsert({ user_id: id }, { onConflict: "user_id" });

      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }
    } else {
      const { error: deleteError } = await adminClient
        .from("app_admins")
        .delete()
        .eq("user_id", id);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, id, isAdmin: body.isAdmin });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "권한 변경 실패" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/users/[id]: 사용자 계정을 삭제한다.
 */
export async function DELETE(req: Request, { params }: RouteParams) {
  const auth = await authenticateAdminRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "대상 사용자 ID가 필요합니다." }, { status: 400 });
  }

  // 본인 계정 삭제 차단
  const selfCheck = preventSelfAction(auth.user.id, id, "delete");
  if (selfCheck) {
    return NextResponse.json(
      { error: selfCheck.error },
      { status: selfCheck.status },
    );
  }

  try {
    const { adminClient } = auth;
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "계정 삭제 실패" },
      { status: 500 },
    );
  }
}
