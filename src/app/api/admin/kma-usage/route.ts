import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/features/accounts/server/admin-auth";
import { KMA_DAILY_LIMIT } from "@/features/worksite-weather/constants/kma-usage";
import { buildUsageReport, type UsageRow } from "@/features/worksite-weather/lib/kma-usage-stats";

export const dynamic = "force-dynamic";

/** 오늘 포함 7일 + 시간대 경계 여유 */
const LOOKBACK_DAYS = 8;

/**
 * GET /api/admin/kma-usage: 기상청 호출 집계(오늘 시간대별·최근 7일)와 한도 대비 사용률을 돌려준다. 관리자만 부를 수 있다.
 * 테이블이 아직 없으면(마이그레이션 전) `available: false`.
 */
export async function GET(req: Request) {
  const auth = await authenticateAdminRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await auth.adminClient
    .from("kma_api_usage")
    .select("hour_kst, provider, operation, source, calls, errors")
    .gte("hour_kst", since)
    .order("hour_kst", { ascending: true })
    .limit(5000);

  if (error) {
    return NextResponse.json({ available: false });
  }

  const rows: UsageRow[] = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    hourKst: String(row.hour_kst),
    provider: String(row.provider ?? ""),
    operation: String(row.operation ?? ""),
    source: row.source === "prefetch" ? "prefetch" : "user",
    calls: Number(row.calls) || 0,
    errors: Number(row.errors) || 0,
  }));

  return NextResponse.json(buildUsageReport(rows, new Date(), KMA_DAILY_LIMIT));
}
