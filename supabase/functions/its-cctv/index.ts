/**
 * ITS 국가교통정보센터 CCTV 조회 프록시 (Supabase Edge Function · Deno).
 *
 * **왜 필요한가**
 * ITS는 `openapi.its.go.kr:9443`에서만 서비스하는데 Cloudflare Workers는
 * 이 주소로 나갈 수 없다 — `fetch()`는 배포 시 비표준 포트를 버리고 443으로 붙고,
 * `cloudflare:sockets`의 `connect()`는 엣지 egress가 거부한다
 * (`proxy request failed, cannot connect to the specified address`).
 * Deno 런타임은 포트를 그대로 지키므로 여기서 대신 호출한다.
 * 자세한 경위는 `docs/Ver_1.1/Ver_1.1_CCTV_PLAN.md` 부록 E.
 *
 * 인증키는 Supabase 시크릿에 두고 절대 응답에 싣지 않는다.
 *   supabase secrets set ITS_API_KEY=<발급받은 키>
 */

const ITS_ENDPOINT = "https://openapi.its.go.kr:9443/cctvInfo";
const TIMEOUT_MS = 20_000;

/** ITS 도로 종별. 임의 값을 넘기면 ITS가 조용히 `ex`로 처리해 오해를 부른다. */
const ALLOWED_ROAD_TYPES = new Set(["ex", "its"]);

/** 1 = HTTP 스트리밍, 4 = HTTPS 스트리밍. HTTPS 페이지에서 재생하려면 4만 쓸 수 있다. */
const ALLOWED_CCTV_TYPES = new Set(["1", "2", "3", "4"]);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * 경계상자를 읽고 검증한다.
 * 열린 프록시가 되지 않도록 호출부가 보낸 값을 그대로 흘리지 않는다.
 */
function readBbox(params: URLSearchParams): Record<string, string> | null {
  const bbox: Record<string, string> = {};

  for (const key of ["minX", "maxX", "minY", "maxY"]) {
    const raw = params.get(key);
    if (raw === null || raw.trim() === "") return null;

    const value = Number(raw);
    if (!Number.isFinite(value)) return null;

    // X는 경도(±180), Y는 위도(±90)
    if (Math.abs(value) > (key.endsWith("X") ? 180 : 90)) return null;

    bbox[key] = String(value);
  }

  if (Number(bbox.minX) >= Number(bbox.maxX)) return null;
  if (Number(bbox.minY) >= Number(bbox.maxY)) return null;

  return bbox;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return json({ error: "GET만 지원합니다." }, 405);
  }

  const apiKey = (Deno.env.get("ITS_API_KEY") ?? "").trim();
  if (!apiKey) {
    return json(
      {
        error:
          "ITS 인증키가 설정되지 않았습니다. " +
          "supabase secrets set ITS_API_KEY=<키> 로 등록하세요.",
      },
      500,
    );
  }

  const params = new URL(request.url).searchParams;

  const roadType = params.get("type") ?? "";
  if (!ALLOWED_ROAD_TYPES.has(roadType)) {
    return json({ error: `type은 ${[...ALLOWED_ROAD_TYPES].join(", ")} 중에서 지정하세요.` }, 400);
  }

  const cctvType = params.get("cctvType") ?? "4";
  if (!ALLOWED_CCTV_TYPES.has(cctvType)) {
    return json({ error: "cctvType이 올바르지 않습니다." }, 400);
  }

  const bbox = readBbox(params);
  if (!bbox) {
    return json({ error: "경계상자(minX, maxX, minY, maxY)가 올바르지 않습니다." }, 400);
  }

  const target = new URL(ITS_ENDPOINT);
  target.searchParams.set("apiKey", apiKey);
  target.searchParams.set("type", roadType);
  target.searchParams.set("cctvType", cctvType);
  target.searchParams.set("getType", "json");
  for (const [key, value] of Object.entries(bbox)) {
    target.searchParams.set(key, value);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "원인 불명";
    return json({ error: `ITS API 연결에 실패했습니다. (${reason})` }, 502);
  }

  const text = await upstream.text();

  // ITS 본문을 그대로 넘긴다. 여기서 모양을 바꾸면 호출부의 파싱과 어긋난다.
  return new Response(text, {
    status: upstream.status,
    headers: {
      ...CORS_HEADERS,
      "content-type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
});
