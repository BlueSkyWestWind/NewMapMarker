import "server-only";
import { keepAlive } from "@/features/worksite-weather/lib/keep-alive";
import { kstHourStartIso } from "@/features/worksite-weather/lib/kma-usage-stats";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type UsageSource = "user" | "prefetch";
export type UsageProvider = "apihub" | "datago";

interface RecordInput {
  provider: UsageProvider;
  operation: string;
  source: UsageSource;
  /** 실패한 호출이면 오류 코드(원문 메시지·URL·키 금지) */
  error?: string | null;
}

/**
 * 기상청으로 나간 호출 1건을 시간대별 카운터에 올린다.
 *
 * 날씨 응답을 막거나 깨뜨리지 않는 것이 최우선이다. 마이그레이션 미적용·서비스 키 없음·DB 장애는
 * 모두 삼키고 서버 로그에만 남긴다. 기다리지 않으며(발사 후 망각), Workers에서는
 * 응답이 끝난 뒤에도 기록이 완료되도록 `waitUntil`에 맡긴다.
 */
export function recordKmaCall(input: RecordInput): void {
  try {
    const pending = Promise.resolve(
      getSupabaseAdminClient().rpc("record_kma_call", {
        p_hour: kstHourStartIso(new Date()),
        p_provider: input.provider,
        p_operation: input.operation,
        p_source: input.source,
        p_error: input.error ?? null,
      }),
    )
      .then(({ error }) => {
        if (error) console.warn("[kma-usage] 호출 집계를 저장하지 못했습니다:", error.message);
      })
      .catch((err: unknown) => {
        console.warn("[kma-usage] 호출 집계 중 오류:", err instanceof Error ? err.message : "알 수 없음");
      });

    keepAlive(pending);
  } catch (err) {
    console.warn("[kma-usage] 호출 집계를 건너뜁니다:", err instanceof Error ? err.message : "알 수 없음");
  }
}
