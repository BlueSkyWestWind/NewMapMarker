"use client";

import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { fetchAuditLog } from "../api";
import { AUDIT_ACTION_LABELS, describeAuditDetail } from "../lib/audit-log";
import { formatAccountDateTime } from "../lib/account-helpers";

interface AccountAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 관리자 작업 기록 창: 계정 생성·삭제·관리자 권한 변경을 최근 순으로 보여 준다(시각, 관리자, 작업, 대상, IP). */
export function AccountAuditDialog({ open, onOpenChange }: AccountAuditDialogProps) {
  const { session } = useAuthSession();
  const token = session?.access_token;

  const query = useQuery({
    queryKey: ["admin-audit-log"],
    queryFn: () => fetchAuditLog(token!),
    enabled: open && !!token,
    retry: false,
    staleTime: 10_000,
  });
  const entries = query.data?.entries ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(1000px,96vw)] max-w-none flex-col gap-3 border-slate-800 bg-slate-900 p-5 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">관리자 작업 기록</DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            계정 생성·삭제·관리자 권한 변경을 누가 언제 했는지 최근 순으로 보여 줍니다(최근 200건).
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">불러오는 중...</p>
        ) : query.error ? (
          <p className="p-4 text-sm text-rose-400">
            불러오지 못했습니다. {query.error instanceof Error ? query.error.message : ""}
          </p>
        ) : query.data && !query.data.available ? (
          <p className="rounded-md border border-amber-900/50 bg-amber-950/30 p-3 text-xs text-amber-300">
            작업 기록이 아직 적용되지 않았습니다. Supabase SQL Editor에서 04_admin_accounts.sql을
            실행해 주세요.
          </p>
        ) : entries.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">기록된 작업이 아직 없습니다.</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-slate-800">
            <table className="w-full table-fixed border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-950 text-[11px] text-slate-400">
                <tr>
                  <th className="w-36 whitespace-nowrap px-2 py-1.5 text-left font-medium">시각</th>
                  <th className="w-56 whitespace-nowrap px-2 py-1.5 text-left font-medium">관리자</th>
                  <th className="w-36 whitespace-nowrap px-2 py-1.5 text-left font-medium">작업</th>
                  <th className="w-56 whitespace-nowrap px-2 py-1.5 text-left font-medium">대상 계정</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">IP · 상세</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const detail = describeAuditDetail(entry.action, entry.detail);
                  const tail = [entry.ip ?? "-", detail].filter(Boolean).join(" · ");
                  const danger = entry.action === "account_delete" || entry.action === "admin_revoke";
                  return (
                    <tr key={entry.id} className="border-t border-slate-800">
                      <td className="whitespace-nowrap px-2 py-1.5 text-slate-300">
                        {formatAccountDateTime(entry.occurredAt)}
                      </td>
                      <td className="truncate whitespace-nowrap px-2 py-1.5" title={entry.actorEmail}>
                        {entry.actorEmail || "-"}
                      </td>
                      <td
                        className={
                          danger
                            ? "whitespace-nowrap px-2 py-1.5 text-rose-300"
                            : "whitespace-nowrap px-2 py-1.5 text-emerald-300"
                        }
                      >
                        {AUDIT_ACTION_LABELS[entry.action]}
                      </td>
                      <td className="truncate whitespace-nowrap px-2 py-1.5" title={entry.targetEmail}>
                        {entry.targetEmail || "-"}
                      </td>
                      <td className="truncate whitespace-nowrap px-2 py-1.5 text-slate-400" title={tail}>
                        {tail}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
