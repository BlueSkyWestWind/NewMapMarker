import { NextResponse } from "next/server";
import { defaultSliceDeps, runPrefetchSlice } from "@/features/worksite-weather/lib/kma-prefetch";
import { isPrefetchTokenValid } from "@/features/worksite-weather/lib/kma-prefetch-plan";

export const dynamic = "force-dynamic";

/**
 * POST /api/internal/kma-prefetch: 07~17시(KST) 사전 수집 한 조각.
 * Supabase pg_cron(pg_net)만 부른다. 사용자 로그인 대신 `x-kma-prefetch-token` 헤더를 상수 시간으로 비교한다.
 * 토큰이 맞지 않거나 서버에 설정되지 않았으면 401. 응답·로그에 토큰이나 기상청 키를 남기지 않는다.
 */
export async function POST(req: Request) {
  const provided = req.headers.get("x-kma-prefetch-token");
  if (!isPrefetchTokenValid(provided, process.env.KMA_PREFETCH_TOKEN)) {
    return NextResponse.json({ error: "허용되지 않은 요청입니다." }, { status: 401 });
  }

  try {
    const result = await runPrefetchSlice(defaultSliceDeps(), new Date());
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "수집 중 오류가 발생했습니다." }, { status: 500 });
  }
}
