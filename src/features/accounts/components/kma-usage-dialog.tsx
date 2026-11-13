"use client";

import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { isPrefetchStalled, type KmaUsageReport } from "@/features/worksite-weather/lib/kma-usage-stats";
import { fetchKmaUsage } from "../api";

interface KmaUsageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TH = "whitespace-nowrap px-2 py-1.5 text-right font-medium";
const TD = "whitespace-nowrap px-2 py-1.5 text-right tabular-nums";

const formatPercent = (ratio: number): string => `${(ratio * 100).toFixed(1)}%`;

/** 기상청 호출 현황 창: 오늘 사용량·한도 대비 사용률, 오늘 시간대별, 최근 7일. */
export function KmaUsageDialog({ open, onOpenChange }: KmaUsageDialogProps) {
  const { session } = useAuthSession();
  const token = session?.access_token;

  const query = useQuery({
    queryKey: ["admin-kma-usage"],
    queryFn: () => fetchKmaUsage(token!),
    enabled: open && !!token,
    retry: false,
    staleTime: 30_000,
  });
  const data = query.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(1000px,96vw)] max-w-none flex-col gap-3 border-slate-800 bg-slate-900 p-5 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">기상청 호출 현황</DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            기상청으로 실제 나간 호출 횟수입니다. 서버가 센 값이라 같은 키를 다른 곳에서도 쓰면 실제 사용량과 다를 수
            있습니다.
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <p className="p-4 text-sm text-slate-400">불러오는 중...</p>
        ) : query.error ? (
          <p className="p-4 text-sm text-rose-400">
            불러오지 못했습니다. {query.error instanceof Error ? query.error.message : ""}
          </p>
        ) : !data || !data.available ? (
          <p className="rounded-md border border-amber-900/50 bg-amber-950/30 p-3 text-xs text-amber-300">
            호출 집계가 아직 적용되지 않았습니다. Supabase SQL Editor에서 20261116000100_kma_api_usage.sql을 실행해
            주세요.
          </p>
        ) : (
          <UsageBody report={data} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function UsageBody({ report }: { report: KmaUsageReport }) {
  const over = report.ratio >= 1;
  const barWidth = `${Math.min(report.ratio, 1) * 100}%`;
  const barColor = over ? "bg-rose-500" : report.warn ? "bg-amber-500" : "bg-sky-500";

  // 07:30 이후인데 오늘 자동 수집이 0건이면 수집 설정(토큰·주소, pg_net)이 안 끝난 것이다
  const prefetchStalled = isPrefetchStalled(report.hours, new Date());

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      {prefetchStalled ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
          <TriangleAlert aria-hidden className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
          오늘 자동 수집이 한 번도 돌지 않았습니다. 토큰·주소(vault)와 `pg_net` 설정을 확인하세요.
        </p>
      ) : null}
      <section className="rounded-md border border-slate-800 bg-slate-950 p-3">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-semibold tabular-nums">{report.todayTotal.toLocaleString()}</span>
          <span className="whitespace-nowrap text-xs text-slate-400">
            / {report.limit.toLocaleString()}건 · 오늘 {formatPercent(report.ratio)}
          </span>
          {over ? (
            <span className="whitespace-nowrap rounded-sm bg-rose-950 px-2 py-0.5 text-[11px] text-rose-300">
              한도 초과
            </span>
          ) : report.warn ? (
            <span className="whitespace-nowrap rounded-sm bg-amber-950 px-2 py-0.5 text-[11px] text-amber-300">
              한도 임박
            </span>
          ) : null}
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-sm bg-slate-800">
          <div className={`h-full ${barColor}`} style={{ width: barWidth }} />
        </div>
      </section>

      <div className="grid min-h-0 gap-3 md:grid-cols-2">
        <section className="min-h-0 rounded-md border border-slate-800">
          <h3 className="px-2 py-1.5 text-xs font-medium text-slate-300">오늘 시간대별</h3>
          <div className="max-h-[48vh] overflow-y-auto">
            <table className="w-full table-fixed border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-950 text-[11px] text-slate-400">
                <tr>
                  <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">시각</th>
                  <th className={TH}>사용자</th>
                  <th className={TH}>사전수집</th>
                  <th className={TH}>수동</th>
                  <th className={TH}>오류</th>
                  <th className={TH}>합계</th>
                </tr>
              </thead>
              <tbody>
                {report.hours.map((h) => (
                  <tr key={h.hour} className="border-t border-slate-800">
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-300">{String(h.hour).padStart(2, "0")}시</td>
                    <td className={TD}>{h.user.toLocaleString()}</td>
                    <td className={TD}>{h.prefetch.toLocaleString()}</td>
                    <td className={TD}>{h.manual.toLocaleString()}</td>
                    <td className={h.errors > 0 ? `${TD} text-rose-300` : TD}>{h.errors.toLocaleString()}</td>
                    <td className={TD}>{(h.user + h.prefetch + h.manual).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="min-h-0 rounded-md border border-slate-800">
          <h3 className="px-2 py-1.5 text-xs font-medium text-slate-300">최근 7일</h3>
          <div className="max-h-[48vh] overflow-y-auto">
            <table className="w-full table-fixed border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-950 text-[11px] text-slate-400">
                <tr>
                  <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">날짜</th>
                  <th className={TH}>사용자</th>
                  <th className={TH}>사전수집</th>
                  <th className={TH}>수동</th>
                  <th className={TH}>오류</th>
                  <th className={TH}>합계</th>
                </tr>
              </thead>
              <tbody>
                {[...report.days].reverse().map((d) => (
                  <tr key={d.date} className="border-t border-slate-800">
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-300">{d.date}</td>
                    <td className={TD}>{d.user.toLocaleString()}</td>
                    <td className={TD}>{d.prefetch.toLocaleString()}</td>
                    <td className={TD}>{d.manual.toLocaleString()}</td>
                    <td className={d.errors > 0 ? `${TD} text-rose-300` : TD}>{d.errors.toLocaleString()}</td>
                    <td className={TD}>{d.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
