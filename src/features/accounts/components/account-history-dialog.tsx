"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthSession } from "@/features/map-marker/hooks/use-auth-session";
import { fetchLoginHistory } from "../api";
import { formatClock, localDateKey, summarizeLoginHistory } from "../lib/login-history";
import type { AdminUser } from "../types";

/** 전체 이력 표에 보이는 최근 이벤트 수 */
const EVENT_ROWS = 100;
const HOUR_LABELS = new Set([0, 6, 12, 18, 23]);

interface AccountHistoryDialogProps {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2" title={title}>
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="truncate whitespace-nowrap text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

/**
 * 계정의 접속 기록 창: 요약(로그인 횟수·접속 IP·마지막 로그인), 시간대별 로그인 분포,
 * 날짜별 요약, 최근 이벤트 이력(시각·이벤트·IP). 기록은 Supabase 감사 로그라 브라우저 정보는 없다.
 */
export function AccountHistoryDialog({ user, open, onOpenChange }: AccountHistoryDialogProps) {
  const { session } = useAuthSession();
  const token = session?.access_token;
  const userId = user?.id;

  const query = useQuery({
    queryKey: ["admin-user-history", userId],
    queryFn: () => fetchLoginHistory(token!, userId!),
    enabled: open && !!token && !!userId,
    retry: false,
    staleTime: 15_000,
  });

  const events = useMemo(() => query.data?.events ?? [], [query.data]);
  const summary = useMemo(() => summarizeLoginHistory(events), [events]);
  const maxHour = Math.max(1, ...summary.loginsByHour);
  const recent = useMemo(
    () => [...events].sort((a, b) => b.at.localeCompare(a.at)).slice(0, EVENT_ROWS),
    [events],
  );

  if (!user) return null;

  const lastLogin = summary.lastLoginAt
    ? `${localDateKey(summary.lastLoginAt) ?? ""} ${formatClock(summary.lastLoginAt)}`
    : "-";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(820px,96vw)] max-w-none flex-col gap-3 overflow-y-auto border-slate-800 bg-slate-900 p-5 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">접속 기록</DialogTitle>
          <DialogDescription className="text-xs text-slate-400">{user.email}</DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">불러오는 중...</p>
        ) : query.error ? (
          <p className="p-4 text-sm text-rose-400">
            불러오지 못했습니다. {query.error instanceof Error ? query.error.message : ""}
          </p>
        ) : query.data && !query.data.available ? (
          <p className="rounded-md border border-amber-900/50 bg-amber-950/30 p-3 text-xs text-amber-300">
            접속 기록 조회가 아직 적용되지 않았습니다. Supabase SQL Editor에서
            20261114000000_admin_user_login_history.sql을 실행해 주세요.
          </p>
        ) : events.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">
            남아 있는 로그인·로그아웃 기록이 없습니다(Supabase 감사 기록이 꺼져 있거나 보관 기간이 지났을 수 있습니다).
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="로그인 횟수" value={`${summary.totalLogins}회`} title={`최근 ${events.length}건 기준`} />
              <Stat
                label="접속한 IP"
                value={`${summary.uniqueIps.length}개`}
                title={summary.uniqueIps.join(", ")}
              />
              <Stat label="마지막 로그인" value={lastLogin} />
            </div>

            <section className="flex flex-col gap-1.5">
              <h3 className="text-xs font-semibold text-slate-200">시간대별 로그인</h3>
              <div className="flex items-end gap-0.5" role="img" aria-label="시간대별 로그인 횟수">
                {summary.loginsByHour.map((count, hour) => (
                  <div key={hour} className="flex flex-1 flex-col items-center gap-0.5" title={`${hour}시 · ${count}회`}>
                    <div className="flex h-12 w-full items-end">
                      <div
                        className={count > 0 ? "w-full rounded-sm bg-indigo-500" : "w-full rounded-sm bg-slate-800"}
                        style={{ height: count > 0 ? `${Math.max(12, (count / maxHour) * 100)}%` : "4%" }}
                      />
                    </div>
                    <span className="h-3 text-[10px] text-slate-500">{HOUR_LABELS.has(hour) ? hour : ""}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-1.5">
              <h3 className="text-xs font-semibold text-slate-200">날짜별 요약</h3>
              <div className="max-h-48 overflow-y-auto rounded-md border border-slate-800">
                <table className="w-full table-fixed border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-950 text-[11px] text-slate-400">
                    <tr>
                      <th className="w-28 whitespace-nowrap px-2 py-1.5 text-left font-medium">날짜</th>
                      <th className="w-16 whitespace-nowrap px-2 py-1.5 text-left font-medium">로그인</th>
                      <th className="w-24 whitespace-nowrap px-2 py-1.5 text-left font-medium">첫~마지막</th>
                      <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">접속 IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.days.map((day) => (
                      <tr key={day.date} className="border-t border-slate-800">
                        <td className="whitespace-nowrap px-2 py-1.5">{day.date}</td>
                        <td className="whitespace-nowrap px-2 py-1.5">{day.logins}회</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-slate-400">
                          {day.firstLoginAt ? `${formatClock(day.firstLoginAt)}~${formatClock(day.lastLoginAt)}` : "-"}
                        </td>
                        <td className="truncate whitespace-nowrap px-2 py-1.5 text-slate-300" title={day.ips.join(", ")}>
                          {day.ips.length > 0 ? day.ips.join(", ") : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="flex flex-col gap-1.5">
              <h3 className="text-xs font-semibold text-slate-200">
                전체 이력 <span className="font-normal text-slate-500">(최근 {recent.length}건)</span>
              </h3>
              <div className="max-h-64 overflow-y-auto rounded-md border border-slate-800">
                <table className="w-full table-fixed border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-950 text-[11px] text-slate-400">
                    <tr>
                      <th className="w-40 whitespace-nowrap px-2 py-1.5 text-left font-medium">시각</th>
                      <th className="w-20 whitespace-nowrap px-2 py-1.5 text-left font-medium">이벤트</th>
                      <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((event, index) => (
                      <tr key={`${event.at}-${index}`} className="border-t border-slate-800">
                        <td className="whitespace-nowrap px-2 py-1.5 text-slate-300">
                          {localDateKey(event.at) ?? "-"} {formatClock(event.at)}
                        </td>
                        <td
                          className={
                            event.action === "login"
                              ? "whitespace-nowrap px-2 py-1.5 text-emerald-300"
                              : "whitespace-nowrap px-2 py-1.5 text-slate-400"
                          }
                        >
                          {event.action === "login" ? "로그인" : "로그아웃"}
                        </td>
                        <td className="truncate whitespace-nowrap px-2 py-1.5" title={event.ip ?? undefined}>
                          {event.ip ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
