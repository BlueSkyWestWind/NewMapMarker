import { NextRequest, NextResponse } from "next/server";
import { guardProxyRequest } from "@/lib/api/proxy-guard";

const MAX_SIZE = 1024;

function toEvenSize(value: number): number {
  const clamped = Math.min(MAX_SIZE, Math.max(2, Math.round(value)));
  return clamped % 2 === 0 ? clamped : clamped - 1;
}

/**
 * 카카오 REST API가 요구하는 KA 헤더.
 * Authorization(KakaoAK)과 함께 os/origin이 필요하다.
 */
function buildKakaoKaHeader(request: NextRequest): string {
  const origin =
    request.headers.get("origin") ||
    request.headers.get("referer")?.replace(/\/[^/]*$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000";

  return [
    "sdk/map-capture-1.0",
    "os/javascript",
    "lang/ko-KR",
    `origin/${origin}`,
  ].join(" ");
}

/**
 * Static Map은 REST API이므로 KakaoAK Authorization이 필수다.
 * JavaScript 키(appkey 쿼리)만으로는 동작하지 않는다.
 */
export async function GET(request: NextRequest) {
  const blocked = guardProxyRequest(request);
  if (blocked) return blocked;

  const params = request.nextUrl.searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const level = Number(params.get("level") ?? "3");
  const width = toEvenSize(Number(params.get("width") ?? "600"));
  const height = toEvenSize(Number(params.get("height") ?? "400"));
  const mapType = params.get("mapType") === "roadmap" ? "ROADMAP" : "SKYVIEW";

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "lat, lng 파라미터가 필요합니다." },
      { status: 400 },
    );
  }

  // Static Map = REST API → REST API 키 필수
  // (JS 키는 지도 SDK용. REST 키가 없으면 JS 키로 시도하되, 콘솔에서 REST 키 설정을 권장)
  const restApiKey = (
    process.env.KAKAO_REST_API_KEY ||
    process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY ||
    ""
  ).trim();
  const jsAppKey = (process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY || "").trim();
  const apiKey = restApiKey || jsAppKey;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "카카오 REST API 키가 없습니다. .env에 KAKAO_REST_API_KEY를 설정하세요. (개발자 콘솔 > 앱 키 > REST API 키)",
      },
      { status: 500 },
    );
  }

  if (!restApiKey) {
    // JS 키만 있는 경우에도 Authorization은 반드시 넣는다.
    // 실패 시 응답 메시지로 REST 키 설정을 안내한다.
  }

  const staticUrl = new URL("https://dapi.kakao.com/v2/maps/staticmap");
  staticUrl.searchParams.set("center", `${lng},${lat}`);
  staticUrl.searchParams.set("level", String(Math.round(level)));
  staticUrl.searchParams.set("size", `${width}x${height}`);
  staticUrl.searchParams.set("map_type", mapType);

  try {
    const response = await fetch(staticUrl.toString(), {
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
      headers: {
        Authorization: `KakaoAK ${apiKey}`,
        KA: buildKakaoKaHeader(request),
      },
    });

    const contentType = response.headers.get("Content-Type") || "";
    const detail = !response.ok
      ? await response.text().catch(() => "")
      : contentType.includes("application/json")
        ? await response.text().catch(() => "")
        : "";

    if (!response.ok) {
      const needsRestKeyHint =
        detail.includes("Authorization") ||
        detail.includes("AccessDenied") ||
        !restApiKey;

      return NextResponse.json(
        {
          error: "카카오 Static Map 요청에 실패했습니다.",
          status: response.status,
          detail: detail.slice(0, 300),
          hint: needsRestKeyHint
            ? "카카오 개발자 콘솔의 REST API 키를 .env에 KAKAO_REST_API_KEY=... 로 추가한 뒤 개발 서버를 재시작하세요. (JavaScript 키와는 다릅니다)"
            : undefined,
        },
        { status: response.status === 429 ? 429 : 502 },
      );
    }

    if (contentType.includes("application/json")) {
      return NextResponse.json(
        {
          error: "카카오 Static Map이 이미지를 반환하지 않았습니다.",
          detail: detail.slice(0, 300),
          hint: "KAKAO_REST_API_KEY(REST API 키) 설정을 확인하세요.",
        },
        { status: 502 },
      );
    }

    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType.includes("image")
          ? contentType
          : "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "카카오 Static Map 요청 중 타임아웃/네트워크 오류가 발생했습니다.",
      },
      { status: 504 },
    );
  }
}
