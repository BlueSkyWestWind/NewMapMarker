/** 관리자 작업 감사 기록: 종류·표시 이름과 한 줄을 만드는 순수 함수. */

export const AUDIT_ACTIONS = ["account_create", "account_delete", "admin_grant", "admin_revoke"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  account_create: "계정 생성",
  account_delete: "계정 삭제",
  admin_grant: "관리자 권한 부여",
  admin_revoke: "관리자 권한 회수",
};

export type AuditDetail = Record<string, string | number | boolean | null>;

export interface AuditInput {
  actorId: string | null;
  actorEmail: string | null | undefined;
  action: AuditAction;
  targetId: string | null;
  targetEmail: string | null | undefined;
  detail?: AuditDetail;
  ip?: string | null;
}

/** `admin_audit_log` 에 넣는 한 행 */
export interface AuditRow {
  actor_id: string | null;
  actor_email: string;
  action: AuditAction;
  target_id: string | null;
  target_email: string;
  detail: AuditDetail;
  ip: string | null;
}

/** 화면에 보이는 기록 한 줄 */
export interface AuditEntry {
  id: number;
  occurredAt: string;
  actorEmail: string;
  action: AuditAction;
  targetEmail: string;
  detail: AuditDetail;
  ip: string | null;
}

export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === "string" && (AUDIT_ACTIONS as readonly string[]).includes(value);
}

export function buildAuditRow(input: AuditInput): AuditRow {
  return {
    actor_id: input.actorId,
    actor_email: (input.actorEmail ?? "").trim(),
    action: input.action,
    target_id: input.targetId,
    target_email: (input.targetEmail ?? "").trim(),
    detail: input.detail ?? {},
    ip: input.ip?.trim() ? input.ip.trim() : null,
  };
}

/**
 * 요청을 보낸 곳의 IP. Cloudflare 가 붙이는 `cf-connecting-ip` 를 먼저 보고,
 * 없으면 `x-forwarded-for` 의 첫 값, 그다음 `x-real-ip` 를 쓴다. 모르면 null.
 */
export function clientIpOf(headers: Headers): string | null {
  const direct = headers.get("cf-connecting-ip")?.trim();
  if (direct) return direct;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return headers.get("x-real-ip")?.trim() || null;
}

/** 상세(detail)를 사람이 읽는 짧은 글로. 예: `관리자 계정으로 생성`. */
export function describeAuditDetail(action: AuditAction, detail: AuditDetail): string {
  if (action === "account_create") {
    const role = detail.isAdmin === true ? "관리자 계정으로 생성" : "일반 계정으로 생성";
    return typeof detail.warning === "string" && detail.warning !== "" ? `${role} (권한 부여 실패)` : role;
  }
  return "";
}
