import { NextRequest, NextResponse } from "next/server";

/**
 * VWorld(국토교통부 공간정보 오픈플랫폼) 연속지적도 프록시.
 * 주소(또는 좌표)를 받아 ① 지오코딩 ② 해당 지점의 필지 폴리곤을 조회해
 * 카카오 지도에 그릴 수 있는 좌표 배열로 변환한다. VWorld 키는 서버에만 둔다.
 *
 * env:
 *   VWORLD_API_KEY  (필수)  VWorld 인증키
 *   VWORLD_DOMAIN   (선택)  키에 등록한 도메인(hostname). 미설정 시 요청 host 사용.
 */

const VWORLD_GEOCODE = "https://api.vworld.kr/req/address";
const VWORLD_DATA = "https://api.vworld.kr/req/data";
/** 연속지적도 - 지적도(필지) 레이어 */
const CADASTRAL_LAYER = "LP_PA_CBND_BUBUN";

interface ParcelPoint {
  lat: number;
  lng: number;
}
interface Parcel {
  rings: ParcelPoint[][];
}

function resolveDomain(request: NextRequest): string {
  const env = process.env.VWORLD_DOMAIN?.trim();
  if (env) return env;
  const origin =
    request.headers.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    request.nextUrl.origin;
  try {
    return new URL(origin).hostname;
  } catch {
    return "localhost";
  }
}

interface GeocodeResult {
  ok: boolean;
  point?: ParcelPoint;
  label?: string;
  /** 실패 원인(진단용, 예: ROAD:INCORRECT_KEY) */
  detail?: string;
}

/** VWorld 지오코더: 주소 → 좌표. 도로명(ROAD)·지번(PARCEL) 순으로 시도한다. */
async function geocode(apiKey: string, address: string): Promise<GeocodeResult> {
  let lastDetail = "NO_RESPONSE";

  for (const type of ["ROAD", "PARCEL"] as const) {
    const url = new URL(VWORLD_GEOCODE);
    url.searchParams.set("service", "address");
    url.searchParams.set("request", "getcoord");
    url.searchParams.set("version", "2.0");
    url.searchParams.set("crs", "epsg:4326");
    url.searchParams.set("type", type);
    url.searchParams.set("address", address);
    url.searchParams.set("format", "json");
    url.searchParams.set("key", apiKey);

    try {
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      const result = json?.response;
      if (result?.status === "OK" && result.result?.point) {
        const lng = Number(result.result.point.x);
        const lat = Number(result.result.point.y);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return {
            ok: true,
            point: { lat, lng },
            label: result.refined?.text || address,
          };
        }
      }
      // 실패 원인 기록 (INCORRECT_KEY / NOT_FOUND 등)
      lastDetail = result?.error?.code
        ? `${type}:${result.error.code}(${result.error.text ?? ""})`
        : `${type}:${result?.status ?? `HTTP_${res.status}`}`;
    } catch (err) {
      lastDetail = `${type}:FETCH_ERROR(${err instanceof Error ? err.message : String(err)})`;
    }
  }
  return { ok: false, detail: lastDetail };
}

function ringToPoints(ring: number[][]): ParcelPoint[] {
  return ring
    .map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

interface GeoJsonGeometry {
  type?: string;
  coordinates?: unknown;
}

function toParcels(featureCollection: unknown): { parcels: Parcel[]; label: string } {
  const fc = featureCollection as
    | { features?: Array<{ geometry?: GeoJsonGeometry; properties?: Record<string, unknown> }> }
    | null
    | undefined;
  const features = fc?.features ?? [];
  const parcels: Parcel[] = [];
  let label = "";

  for (const feature of features) {
    const geometry = feature?.geometry;
    if (!label) {
      const props = feature?.properties ?? {};
      label = String(props.addr || props.jibun || props.bonbun || "").trim();
    }
    if (!geometry?.type || !geometry.coordinates) continue;

    if (geometry.type === "Polygon") {
      const rings = (geometry.coordinates as number[][][]).map(ringToPoints);
      parcels.push({ rings });
    } else if (geometry.type === "MultiPolygon") {
      for (const poly of geometry.coordinates as number[][][][]) {
        parcels.push({ rings: poly.map(ringToPoints) });
      }
    }
  }

  return { parcels, label };
}

/** VWorld 데이터API: 좌표(POINT) → 필지 폴리곤(GeoJSON). */
async function fetchParcels(
  apiKey: string,
  domain: string,
  point: ParcelPoint,
): Promise<{ parcels: Parcel[]; label: string }> {
  const url = new URL(VWORLD_DATA);
  url.searchParams.set("service", "data");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("data", CADASTRAL_LAYER);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("domain", domain);
  url.searchParams.set("crs", "EPSG:4326");
  url.searchParams.set("geomFilter", `POINT(${point.lng} ${point.lat})`);
  url.searchParams.set("format", "json");
  url.searchParams.set("geometry", "true");
  url.searchParams.set("size", "10");

  // Referer 헤더를 보내면 VWorld가 domain 파라미터 대신 Referer 호스트로
  // 검증하다 INCORRECT_KEY를 반환한다. domain 파라미터만 사용한다.
  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  const status = json?.response?.status;
  if (status !== "OK") {
    // NOT_FOUND(해당 지점 필지 없음)는 빈 결과로 처리, 그 외는 오류로 본다.
    if (status === "NOT_FOUND") return { parcels: [], label: "" };
    const err = json?.response?.error?.text || json?.response?.status;
    throw new Error(`VWorld 필지 조회 실패: ${err ?? "알 수 없음"}`);
  }

  return toParcels(json.response.result?.featureCollection);
}

export async function GET(request: NextRequest) {
  const rawKey = process.env.VWORLD_API_KEY ?? "";
  const apiKey = rawKey.trim();

  // 배포 환경 키 진단용(값은 노출하지 않음: 길이·앞뒤 4자만).
  // 예상: length=36, head=9D6E, tail=8083. 다르면 Cloudflare 키 입력이 잘못된 것.
  if (request.nextUrl.searchParams.get("debug") === "1") {
    return NextResponse.json({
      hasKey: apiKey.length > 0,
      rawLength: rawKey.length,
      trimmedLength: apiKey.length,
      head: apiKey.slice(0, 4),
      tail: apiKey.slice(-4),
      domain: resolveDomain(request),
    });
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "VWORLD_API_KEY가 설정되지 않았습니다. .env에 등록하세요." },
      { status: 500 },
    );
  }

  const params = request.nextUrl.searchParams;
  const address = params.get("address")?.trim() ?? "";
  const latParam = params.get("lat");
  const lngParam = params.get("lng");

  let center: ParcelPoint | null = null;
  let label = "";

  if (latParam !== null && lngParam !== null) {
    const lat = Number(latParam);
    const lng = Number(lngParam);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      center = { lat, lng };
    }
  }

  if (!center) {
    if (!address) {
      return NextResponse.json(
        { error: "address 또는 lat/lng 파라미터가 필요합니다." },
        { status: 400 },
      );
    }
    const geocoded: GeocodeResult = await geocode(apiKey, address);
    if (!geocoded.ok || !geocoded.point) {
      return NextResponse.json(
        {
          error: "주소를 찾을 수 없습니다. 도로명 또는 지번 주소를 확인하세요.",
          detail: geocoded.detail ?? "",
        },
        { status: 404 },
      );
    }
    center = geocoded.point;
    label = geocoded.label ?? "";
  }

  try {
    const domain = resolveDomain(request);
    const { parcels, label: parcelLabel } = await fetchParcels(
      apiKey,
      domain,
      center,
    );

    return NextResponse.json(
      {
        center,
        label: label || parcelLabel || address,
        parcels,
      },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "필지 경계 조회 중 오류";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
