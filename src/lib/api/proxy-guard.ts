import { NextRequest, NextResponse } from "next/server";

/**
 * 브라우저에서만 호출되는 프록시 라우트(정적맵·타일·로드뷰)를 외부 남용으로부터 보호한다.
 * - 자기 도메인 이외의 Origin/Referer 요청 차단 (핫링크·타 사이트 임베드 방지)
 * - IP당 슬라이딩 윈도 레이트리밋 (쿼터 소진 공격 완화, best-effort)
 *
 * 카카오 REST 쿼터·타일 대역폭을 아무나 소진시키지 못하게 하는 게 목적이다.
 */

/** 쉼표로 구분된 추가 허용 origin (예: 커스텀 도메인). */
function getExtraAllowedHosts(): Set<string> {
  const hosts = new Set<string>();
  const raw = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""},${
    process.env.PROXY_ALLOWED_ORIGINS ?? ""
  }`;
  raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => {
      try {
        hosts.add(new URL(value).host.toLowerCase());
      } catch {
        // origin 형태가 아니면 host 문자열로 간주
        hosts.add(value.toLowerCase());
      }
    });
  return hosts;
}

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Origin/Referer가 존재하고 자기 도메인이 아니면 차단한다.
 * 헤더가 모두 없으면(일부 브라우저가 Referer를 제거) 통과시키되 레이트리밋으로 방어한다.
 */
export function isSameOriginRequest(request: NextRequest): boolean {
  const selfHost = request.nextUrl.host.toLowerCase();
  const forwardedHost = request.headers.get("x-forwarded-host")?.toLowerCase();
  const allowed = getExtraAllowedHosts();
  allowed.add(selfHost);
  if (forwardedHost) allowed.add(forwardedHost);

  const originHost = hostOf(request.headers.get("origin"));
  const refererHost = hostOf(request.headers.get("referer"));

  if (originHost && !allowed.has(originHost)) return false;
  if (refererHost && !allowed.has(refererHost)) return false;
  return true;
}

// ── best-effort in-memory 레이트리밋 (isolate 단위) ──────────────────────────
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 300;
const hits = new Map<string, number[]>();

function clientKey(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function isRateLimited(request: NextRequest): boolean {
  const key = clientKey(request);
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);

  // 맵이 무한정 커지지 않도록 가끔 청소
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }

  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

/**
 * 프록시 라우트 진입부에서 호출. 차단해야 하면 NextResponse를, 통과면 null을 반환한다.
 */
export function guardProxyRequest(request: NextRequest): NextResponse | null {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "허용되지 않은 요청 출처입니다." },
      { status: 403 },
    );
  }
  if (isRateLimited(request)) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  return null;
}
