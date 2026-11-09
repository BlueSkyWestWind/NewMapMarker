import { NextResponse } from "next/server";
import { isAuditAction, type AuditEntry } from "@/features/accounts/lib/audit-log";
import { authenticateAdminRequest } from "@/features/accounts/server/admin-auth";

export const dynamic = "force-dynamic";

/** 한 번에 보내는 최대 기록 수 */
const AUDIT_LIMIT = 200;

/**
 * GET /api/admin/audit: 관리자 작업 기록(계정 생성·삭제·권한 변경)을 최근 순으로 돌려준다. 관리자만 부를 수 있다.
 * 테이블이 아직 없으면(마이그레이션 전) `available: false`.
 */
export async function GET(req: Request) {
  const auth = await authenticateAdminRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await auth.adminClient
    .from("admin_audit_log")
    .select("id, occurred_at, actor_email, action, target_email, detail, ip")
    .order("occurred_at", { ascending: false })
    .limit(AUDIT_LIMIT);

  if (error) {
    return NextResponse.json({ entries: [] satisfies AuditEntry[], available: false });
  }

  const entries: AuditEntry[] = ((data ?? []) as Record<string, unknown>[])
    .filter((row) => isAuditAction(row.action))
    .map((row) => ({
      id: Number(row.id),
      occurredAt: String(row.occurred_at),
      actorEmail: String(row.actor_email ?? ""),
      action: row.action as AuditEntry["action"],
      targetEmail: String(row.target_email ?? ""),
      detail: (row.detail && typeof row.detail === "object" ? row.detail : {}) as AuditEntry["detail"],
      ip: typeof row.ip === "string" ? row.ip : null,
    }));

  return NextResponse.json({ entries, available: true });
}
