import { NextRequest, NextResponse } from "next/server";
import { guardProxyRequest } from "@/lib/api/proxy-guard";

/**
 * 카카오/다음 지도 타일만 프록시한다. (SSRF 방지)
 * Static Map API가 비활성인 앱에서도 격자 캡처가 가능하도록 한다.
 */
function isAllowedTileHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "daumcdn.net" ||
    host.endsWith(".daumcdn.net") ||
    host === "kakaocdn.net" ||
    host.endsWith(".kakaocdn.net") ||
    host === "kakao.com" ||
    host.endsWith(".kakao.com") ||
    host === "daum.net" ||
    host.endsWith(".daum.net")
  );
}

export async function GET(request: NextRequest) {
  const blocked = guardProxyRequest(request);
  if (blocked) return blocked;

  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json(
      { error: "url 파라미터가 필요합니다." },
      { status: 400 },
    );
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "잘못된 url입니다." }, { status: 400 });
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return NextResponse.json(
      { error: "http/https URL만 허용됩니다." },
      { status: 400 },
    );
  }

  if (!isAllowedTileHost(target.hostname)) {
    return NextResponse.json(
      { error: "허용되지 않은 지도 타일 도메인입니다." },
      { status: 403 },
    );
  }

  try {
    const response = await fetch(target.toString(), {
      signal: AbortSignal.timeout(12000),
      cache: "force-cache",
      headers: {
        // 일부 CDN이 빈 UA를 거절하는 경우 대비
        "User-Agent": "Mozilla/5.0 MapCaptureProxy",
        Referer: "https://map.kakao.com/",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "지도 타일 요청에 실패했습니다.",
          status: response.status,
        },
        { status: 502 },
      );
    }

    const contentType = response.headers.get("Content-Type") || "image/png";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "이미지 응답이 아닙니다.", contentType },
        { status: 502 },
      );
    }

    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "지도 타일 프록시 중 오류가 발생했습니다." },
      { status: 504 },
    );
  }
}
