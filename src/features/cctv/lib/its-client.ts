import "server-only";
import type { BoundingBox } from "@/features/cctv/constants/its-config";
import { parseCctvDirection } from "@/features/cctv/lib/parse-direction";
import type { CctvItem } from "@/features/cctv/types/cctv";

/**
 * ITS 국가교통정보센터 CCTV 조회 클라이언트 (서버 전용).
 *
 * **ITS를 직접 부르지 않는다.** ITS는 `openapi.its.go.kr:9443`에서만 서비스하는데
 * Cloudflare Workers는 그 주소로 나갈 수 없다 — `fetch()`는 배포 시 비표준 포트를
 * 버리고, `connect()`는 엣지 egress가 거부한다. 그래서 Deno로 도는
 * Supabase Edge Function(`supabase/functions/its-cctv`)을 거친다.
 * 경위는 계획서 부록 E.
 *
 * 로컬에서도 같은 경로를 쓴다. 환경마다 경로가 다르면 "로컬은 되는데 배포는 안 되는"
 * 상황을 또 만든다 — 이 기능이 이미 두 번 그렇게 깨졌다.
 *
 * 응답 본문은 ITS 원본 그대로다. 성공은 `{ response: { data: [...] } }`,
 * 실패는 `{ header: { resultCode, resultMsg }, body: "" }`로 **모양이 다르다.**
 */
const FETCH_TIMEOUT_MS = 25_000;

export class ItsError extends Error {}

/** 프록시 함수 주소. Supabase 프로젝트 URL에서 유도하므로 별도 환경변수가 없다. */
function getProxyEndpoint(): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) {
    throw new ItsError(
      "NEXT_PUBLIC_SUPABASE_URL이 설정되지 않아 CCTV 프록시 주소를 만들 수 없습니다.",
    );
  }
  return `${base}/functions/v1/its-cctv`;
}

/** Edge Function 호출에 필요한 Supabase 공개 키 */
function getProxyAuthHeaders(): Record<string, string> {
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!anonKey) {
    throw new ItsError("NEXT_PUBLIC_SUPABASE_ANON_KEY가 설정되지 않았습니다.");
  }
  return { Authorization: `Bearer ${anonKey}`, apikey: anonKey };
}

/**
 * ITS 응답 봉투. **성공과 실패의 모양이 다르다** (실호출로 확인, 2026-07-27).
 *
 * - 성공: `{ response: { coordtype, data: [...], datacount } }`
 * - 실패: `{ header: { resultCode, resultMsg }, body: "" }`
 *
 * 오류 응답만 보고 `body`를 파싱하도록 만들면 성공 응답에서 조용히 0건이 된다.
 */
interface ItsEnvelope {
  header?: { resultCode?: number | string; resultMsg?: string };
  response?: { coordtype?: unknown; data?: unknown; datacount?: unknown };
  body?: unknown;
  /** 프록시 함수가 자체적으로 낸 오류 메시지 (ITS 봉투에는 없는 필드) */
  error?: unknown;
}

/** ITS 응답 1건. 필드명이 배포본마다 대소문자·표기가 흔들려 넓게 받는다. */
type ItsRow = Record<string, unknown>;

function pick(row: ItsRow, ...candidates: string[]): string {
  for (const key of Object.keys(row)) {
    const normalized = key.toLowerCase().replace(/_/g, "");
    if (candidates.some((c) => normalized === c.toLowerCase().replace(/_/g, ""))) {
      const value = row[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
  }
  return "";
}

function toNumber(value: string): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * 응답 1건의 실제 필드명 목록.
 * roadsectionid를 못 찾았을 때 "이름이 다른가, 진짜 없는가"를 가릴 유일한 근거다.
 */
export function collectFieldNames(rows: ItsRow[]): string[] {
  const names = new Set<string>();
  for (const row of rows.slice(0, 20)) {
    for (const key of Object.keys(row)) names.add(key);
  }
  return [...names].sort();
}

/** 응답에 roadsectionid 필드가 존재하는지 (값 유무와 별개) — 계획서 §10 확인 1번 */
export function hasRoadSectionField(rows: ItsRow[]): boolean {
  return rows.some((row) =>
    Object.keys(row).some((k) => k.toLowerCase().replace(/_/g, "") === "roadsectionid"),
  );
}

export function normalizeCctvRow(row: ItsRow, roadType: string): CctvItem | null {
  const name = pick(row, "cctvname", "cctvnm", "name", "nm");
  const lat = toNumber(pick(row, "coordy", "lat", "latitude", "ycoord"));
  const lng = toNumber(pick(row, "coordx", "lon", "lng", "longitude", "xcoord"));

  // 좌표가 없으면 지도에 올릴 수 없고 링크 매칭도 불가능하다 → 버린다
  if (lat === null || lng === null) return null;

  const roadSectionId = pick(row, "roadsectionid") || null;
  const streamUrl = pick(row, "cctvurl", "url") || null;
  const { direction, target } = parseCctvDirection(name);

  return {
    // ITS 응답에 안정적인 PK가 없다. 좌표+명칭 조합을 키로 쓴다.
    id: `${roadType}:${lng.toFixed(6)},${lat.toFixed(6)}:${name}`,
    name: name || "(명칭 없음)",
    lat,
    lng,
    roadType,
    roadSectionId,
    direction,
    directionTarget: target,
    streamUrl,
  };
}

/**
 * 응답 본문에서 행 배열을 찾는다.
 *
 * 배포본마다 `body`가 배열이거나 `{ items }`·`{ data }` 등으로 한 겹 더 감싸여 있다.
 * 알려진 형태를 순서대로 시도하고, **못 찾으면 실제 모양을 함께 돌려준다** —
 * 조용히 0건으로 끝나면 "CCTV가 없는 것"과 "구조가 다른 것"을 구분할 수 없다.
 */
function extractRows(envelope: ItsEnvelope): { rows: ItsRow[]; shape: string } {
  // 성공 응답의 정규 경로
  const data = envelope.response?.data;
  if (Array.isArray(data)) return { rows: data as ItsRow[], shape: "response.data[]" };

  const body = envelope.body as unknown;

  if (Array.isArray(body)) return { rows: body as ItsRow[], shape: "body[]" };

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;

    // 한 겹 감싼 흔한 키들을 순서대로 본다
    for (const key of ["items", "item", "data", "list", "rows", "cctvInfo"]) {
      const value = record[key];
      if (Array.isArray(value)) return { rows: value as ItsRow[], shape: `body.${key}[]` };
      if (value && typeof value === "object") {
        return { rows: [value as ItsRow], shape: `body.${key}{}` };
      }
    }

    // 마지막 수단: 배열인 값이 하나뿐이면 그것을 행 목록으로 본다
    const arrayEntries = Object.entries(record).filter(([, v]) => Array.isArray(v));
    if (arrayEntries.length === 1) {
      const [key, value] = arrayEntries[0];
      return { rows: value as ItsRow[], shape: `body.${key}[] (추정)` };
    }

    return { rows: [], shape: `body{${Object.keys(record).join(",")}}` };
  }

  const topKeys = Object.keys(envelope).join(",");
  return {
    rows: [],
    shape: body === "" ? `body(빈 문자열) top{${topKeys}}` : `body(${typeof body}) top{${topKeys}}`,
  };
}

export interface FetchCctvResult {
  rows: ItsRow[];
  /** 행을 어디서 찾았는지(또는 못 찾았을 때 실제 모양). 0건 원인 진단용 */
  shape: string;
  items: CctvItem[];
}

/** 도로 종별 1건 조회. 실패는 호출부가 부분 실패로 처리할 수 있도록 그대로 던진다. */
export async function fetchCctvByRoadType(
  roadType: string,
  bbox: BoundingBox,
): Promise<FetchCctvResult> {
  const url = new URL(getProxyEndpoint());
  url.searchParams.set("type", roadType);
  // 4 = 실시간 스트리밍(HLS) **HTTPS**.
  // 1도 같은 영상이지만 http로만 내려와 HTTPS 페이지에서 혼합 콘텐츠로 차단된다.
  url.searchParams.set("cctvType", "4");
  url.searchParams.set("minX", String(bbox.minX));
  url.searchParams.set("maxX", String(bbox.maxX));
  url.searchParams.set("minY", String(bbox.minY));
  url.searchParams.set("maxY", String(bbox.maxY));

  let status: number;
  let text: string;
  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
      headers: { Accept: "application/json", ...getProxyAuthHeaders() },
    });
    status = response.status;
    text = await response.text();
  } catch {
    throw new ItsError(
      "CCTV 프록시(Supabase Edge Function) 호출이 시간 초과되었거나 연결에 실패했습니다.",
    );
  }

  if (!text.trim().startsWith("{")) {
    // 함수가 배포되지 않았거나 인증이 막히면 JSON이 아닌 본문이 돌아온다.
    // 원인이 드러나도록 상태코드와 응답 앞부분을 함께 남긴다.
    const head = text.trim().slice(0, 120).replace(/\s+/g, " ");
    throw new ItsError(
      `CCTV 프록시가 JSON이 아닌 응답을 반환했습니다. (상태 ${status}) ` +
        `its-cctv 함수가 배포되어 있는지 확인하세요. 응답 앞부분: ${head}`,
    );
  }

  let envelope: ItsEnvelope;
  try {
    envelope = JSON.parse(text) as ItsEnvelope;
  } catch {
    throw new ItsError("ITS API 응답을 해석하지 못했습니다.");
  }

  // 프록시 자체가 낸 오류(미배포·키 미등록·파라미터 거부). ITS 봉투와 모양이 달라 먼저 본다.
  if (typeof envelope.error === "string" && envelope.error) {
    throw new ItsError(envelope.error);
  }

  const code = String(envelope.header?.resultCode ?? "");
  // 4005 = 존재하지 않는 인증키. 원문 메시지는 키가 섞일 수 있어 그대로 쓰지 않는다.
  if (code === "4005" || status === 401) {
    throw new ItsError("ITS 인증키가 유효하지 않습니다. 발급받은 키를 확인하세요.");
  }
  if (code !== "0" && code !== "00" && code !== "") {
    throw new ItsError(`ITS API 응답 오류 (코드 ${code})`);
  }
  if (status < 200 || status >= 300) {
    throw new ItsError(`ITS API가 ${status} 상태를 반환했습니다.`);
  }

  const { rows, shape } = extractRows(envelope);
  const items = rows
    .map((row) => normalizeCctvRow(row, roadType))
    .filter((item): item is CctvItem => item !== null);

  return { rows, shape, items };
}
