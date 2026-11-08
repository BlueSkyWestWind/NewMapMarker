import { NextRequest, NextResponse } from "next/server";
import { guardProxyRequest } from "@/lib/api/proxy-guard";
import { fetchAllowedTile, isAllowedTileHost, TileFetchError } from "@/lib/api/tile-fetch";

/**
 * 카카오/다음 지도 타일만 프록시한다. (SSRF 방지 — 호스트 검사와 리다이렉트 추적은 `tile-fetch`)
 * Static Map API가 비활성인 앱에서도 격자 캡처가 가능하도록 한다.
 */
export async function GET(request: NextRequest) {
  const blocked = await guardProxyRequest(request);
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
    const response = await fetchAllowedTile(target);

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
  } catch (error) {
    if (error instanceof TileFetchError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "지도 타일 프록시 중 오류가 발생했습니다." },
      { status: 504 },
    );
  }
}
