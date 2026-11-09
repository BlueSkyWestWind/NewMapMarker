import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAuditRow, type AuditInput } from "../lib/audit-log";

/**
 * 관리자 작업 기록을 남긴다(서버 전용, 서비스 키 클라이언트). 기록이 실패해도(마이그레이션 전 등)
 * 요청한 작업은 막지 않는다 — 실패는 서버 로그에만 남기고 예외를 던지지 않는다.
 */
export async function recordAudit(adminClient: SupabaseClient, input: AuditInput): Promise<void> {
  try {
    const { error } = await adminClient.from("admin_audit_log").insert(buildAuditRow(input));
    if (error) console.error("[audit] 기록 실패:", error.message);
  } catch (err) {
    console.error("[audit] 기록 실패:", err instanceof Error ? err.message : err);
  }
}

/** 대상 계정의 이메일(삭제 전에 읽어 둔다). 못 읽으면 빈 글. */
export async function lookupEmail(adminClient: SupabaseClient, userId: string): Promise<string> {
  try {
    const { data } = await adminClient.auth.admin.getUserById(userId);
    return data.user?.email ?? "";
  } catch {
    return "";
  }
}
