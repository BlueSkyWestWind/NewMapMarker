import "server-only";
import { CACHE_TTL_MS } from "@/features/worksite-weather/constants/thresholds";
import { WARN_KEYWORDS } from "@/features/worksite-weather/constants/kma-regions";
import type { KmaItem } from "@/features/worksite-weather/lib/merge-sources";
import type { KmaBase } from "@/features/worksite-weather/lib/kma-base-time";
import {
  parseWrnNowText,
  type ParsedAlerts,
} from "@/features/worksite-weather/lib/parse-wrn-text";
import type { TyphoonInfo, WeatherAlert } from "@/features/worksite-weather/types/weather";

/**
 * 기상청 데이터는 두 포털에서 같은 서비스를 미러링한다.
 * 호스트와 인증 파라미터 이름만 다르고 응답 스키마는 동일하다.
 *
 * - 공공데이터포털: `apis.data.go.kr/1360000/...` + `serviceKey` (서비스별 활용신청 필요)
 * - 기상청 API 허브: `apihub.kma.go.kr/api/typ02/openApi/...` + `authKey`
 */
const PROVIDERS = {
  datago: {
    /** 공공데이터포털식 JSON 서비스 루트 */
    baseUrl: "https://apis.data.go.kr/1360000",
    /** 허브 전용 레거시(typ01) 루트. 포털에는 없다. */
    legacyRoot: "",
    authParam: "serviceKey",
    label: "공공데이터포털",
  },
  apihub: {
    baseUrl: "https://apihub.kma.go.kr/api/typ02/openApi",
    legacyRoot: "https://apihub.kma.go.kr/api/typ01/url",
    authParam: "authKey",
    label: "기상청 API 허브",
  },
} as const;

const VILAGE_SERVICE = "VilageFcstInfoService_2.0";
const WARN_SERVICE = "WthrWrnInfoService";

const FETCH_TIMEOUT_MS = 8000;

export class KmaError extends Error {}

/**
 * isolate 메모리 캐시.
 *
 * Cloudflare Cache API는 *.workers.dev 에서 동작하지 않아 배포 환경에서 무효다.
 * 커스텀 도메인을 붙이기 전까지의 1단계 대책으로, 같은 isolate가 재사용되는 동안만
 * 유효한 best-effort 캐시를 쓴다. (CR-004 §8.1)
 */
interface CacheEntry {
  value: unknown;
  expiresAt: number;
}
const memoryCache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 200;

function readCache<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function writeCache(key: string, value: unknown, ttlMs: number): void {
  if (memoryCache.size >= MAX_CACHE_ENTRIES) {
    const now = Date.now();
    for (const [k, entry] of memoryCache) {
      if (entry.expiresAt <= now) memoryCache.delete(k);
    }
    // 만료분만으로 부족하면 가장 오래된 것부터 버린다
    if (memoryCache.size >= MAX_CACHE_ENTRIES) {
      const oldest = memoryCache.keys().next().value;
      if (oldest) memoryCache.delete(oldest);
    }
  }
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** 테스트·운영 점검용 */
export function clearKmaCache(): void {
  memoryCache.clear();
}

interface ResolvedProvider {
  baseUrl: string;
  legacyRoot: string;
  authParam: string;
  label: string;
  key: string;
}

/**
 * 어떤 포털의 키가 설정됐는지로 호출 대상을 정한다.
 * API 허브 키가 있으면 그쪽을 우선한다(서비스별 활용신청 승인을 기다릴 필요가 없다).
 */
function resolveProvider(): ResolvedProvider {
  const hubKey = (process.env.KMA_API_HUB_KEY ?? "").trim();
  if (hubKey) return { ...PROVIDERS.apihub, key: normalizeKey(hubKey) };

  const portalKey = (process.env.KMA_SERVICE_KEY ?? "").trim();
  if (portalKey) return { ...PROVIDERS.datago, key: normalizeKey(portalKey) };

  // .env.local은 배포 환경에 전달되지 않는다. 로컬/배포 두 경로를 모두 안내한다.
  throw new KmaError(
    "기상청 인증키가 설정되지 않았습니다. " +
      "로컬은 .env.local에, 배포 환경은 Cloudflare Workers의 Secret에 " +
      "KMA_API_HUB_KEY(기상청 API 허브) 또는 KMA_SERVICE_KEY(공공데이터포털)를 등록하세요.",
  );
}

/**
 * 공공데이터포털은 인증키를 Encoding/Decoding 두 형태로 준다.
 * 쿼리 조립 시 URLSearchParams가 다시 인코딩하므로 Decoding 키여야 하는데,
 * Encoding 키를 넣는 실수가 잦아 이중 인코딩으로 조용히 401이 난다. 여기서 되돌린다.
 */
function normalizeKey(key: string): string {
  if (!/%[0-9A-Fa-f]{2}/.test(key)) return key;
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

interface KmaResponseBody {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      totalCount?: number;
      items?: { item?: unknown };
    };
  };
  /** 기상청 API 허브의 오류 봉투 (정상 응답에는 없다) */
  result?: { status?: number; message?: string };
}

/**
 * 공공데이터포털 공통 응답 파싱.
 * resultCode가 '00'이 아니면 데이터가 아니라 오류 본문이므로 반드시 걸러낸다.
 */
function extractItems(body: KmaResponseBody): { items: KmaItem[]; totalCount: number } {
  // API 허브는 오류를 { result: { status, message } } 형태로 준다
  if (body.result?.status && body.result.status !== 200) {
    if (body.result.status === 401) throw new KmaError(AUTH_ERROR_MESSAGE);
    if (body.result.status === 403) throw new KmaError(NOT_SUBSCRIBED_MESSAGE);
    throw new KmaError(`기상청 응답 오류 (status ${body.result.status})`);
  }

  const header = body.response?.header;
  const code = header?.resultCode ?? "";

  if (code !== "00") {
    // 30 SERVICE_KEY_IS_NOT_REGISTERED / 31 만료 / 32 등록되지 않은 도메인
    if (["30", "31", "32"].includes(code)) throw new KmaError(AUTH_ERROR_MESSAGE);
    // 원문 메시지를 그대로 노출하면 서비스키가 섞여 나올 수 있어 코드만 전달한다
    if (code === "03") return { items: [], totalCount: 0 }; // NODATA_ERROR
    throw new KmaError(`기상청 응답 오류 (코드 ${code || "불명"})`);
  }

  const raw = body.response?.body?.items?.item;
  const items = Array.isArray(raw) ? (raw as KmaItem[]) : raw ? [raw as KmaItem] : [];
  return { items, totalCount: body.response?.body?.totalCount ?? items.length };
}

/** 키 자체가 틀린 경우 */
const AUTH_ERROR_MESSAGE =
  "기상청 인증키가 유효하지 않습니다. 키 값을 확인하세요. " +
  "(공공데이터포털은 Encoding이 아닌 Decoding 키를 사용해야 합니다)";

/**
 * 키는 맞지만 해당 서비스가 열려 있지 않은 경우.
 * 401과 원인·조치가 완전히 달라서 반드시 구분해 안내한다.
 */
const NOT_SUBSCRIBED_MESSAGE =
  "기상청 인증키는 유효하지만 이 서비스에 활용신청이 되어 있지 않습니다. " +
  "포털에서 해당 API 활용신청을 완료한 뒤 다시 시도하세요.";

async function fetchJson(url: URL): Promise<KmaResponseBody> {
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new KmaError("기상청 API 요청이 시간 초과되었거나 연결에 실패했습니다.");
  }

  // 오류 응답도 본문이 JSON이면 사유가 훨씬 정확하므로(허브의 result.status)
  // 상태코드로 먼저 끊지 않고 본문을 읽어 extractItems가 판단하게 한다.
  const text = await response.text();
  if (text.trim().startsWith("{")) {
    try {
      return JSON.parse(text) as KmaResponseBody;
    } catch {
      throw new KmaError("기상청 API 응답을 해석하지 못했습니다.");
    }
  }

  // 공공데이터포털은 키가 틀리면 JSON이 아니라 평문 "Unauthorized"에 401을 준다
  if (response.status === 401 || /unauthorized|인증키/i.test(text)) {
    throw new KmaError(AUTH_ERROR_MESSAGE);
  }
  if (response.status === 403) throw new KmaError(NOT_SUBSCRIBED_MESSAGE);
  if (!response.ok) {
    throw new KmaError(`기상청 API가 ${response.status} 상태를 반환했습니다.`);
  }
  // dataType=JSON을 줘도 장애 시 XML 오류 페이지가 오는 경우가 있다
  throw new KmaError("기상청 API가 JSON이 아닌 응답을 반환했습니다.");
}

function buildUrl(
  service: string,
  operation: string,
  params: Record<string, string>,
): URL {
  const provider = resolveProvider();
  const url = new URL(`${provider.baseUrl}/${service}/${operation}`);
  url.searchParams.set(provider.authParam, provider.key);
  url.searchParams.set("dataType", "JSON");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

/** 설정된 포털 이름. 운영 점검용. */
export function getActiveProviderLabel(): string {
  return resolveProvider().label;
}

interface GridQuery {
  nx: number;
  ny: number;
  base: KmaBase;
}

/** 단기예보 — 07~17시 골격. totalCount가 넘치면 다음 페이지까지 받아 슬롯 누락을 막는다. */
export async function fetchVilageFcst(query: GridQuery): Promise<KmaItem[]> {
  const cacheKey = `vilage:${query.nx}:${query.ny}:${query.base.baseDate}${query.base.baseTime}`;
  const cached = readCache<KmaItem[]>(cacheKey);
  if (cached) return cached;

  const numOfRows = 1000;
  const first = await fetchJson(
    buildUrl(VILAGE_SERVICE, "getVilageFcst", {
      numOfRows: String(numOfRows),
      pageNo: "1",
      base_date: query.base.baseDate,
      base_time: query.base.baseTime,
      nx: String(query.nx),
      ny: String(query.ny),
    }),
  );

  const { items, totalCount } = extractItems(first);
  const all = [...items];

  const pageCount = Math.ceil(totalCount / numOfRows);
  for (let page = 2; page <= Math.min(pageCount, 3); page += 1) {
    const next = await fetchJson(
      buildUrl(VILAGE_SERVICE, "getVilageFcst", {
        numOfRows: String(numOfRows),
        pageNo: String(page),
        base_date: query.base.baseDate,
        base_time: query.base.baseTime,
        nx: String(query.nx),
        ny: String(query.ny),
      }),
    );
    all.push(...extractItems(next).items);
  }

  writeCache(cacheKey, all, CACHE_TTL_MS.vilage);
  return all;
}

/** 초단기실황 — 현재 시각 보정 */
export async function fetchUltraSrtNcst(query: GridQuery): Promise<KmaItem[]> {
  const cacheKey = `ncst:${query.nx}:${query.ny}:${query.base.baseDate}${query.base.baseTime}`;
  const cached = readCache<KmaItem[]>(cacheKey);
  if (cached) return cached;

  const body = await fetchJson(
    buildUrl(VILAGE_SERVICE, "getUltraSrtNcst", {
      numOfRows: "20",
      pageNo: "1",
      base_date: query.base.baseDate,
      base_time: query.base.baseTime,
      nx: String(query.nx),
      ny: String(query.ny),
    }),
  );

  const { items } = extractItems(body);
  writeCache(cacheKey, items, CACHE_TTL_MS.ncst);
  return items;
}

/** 초단기예보 — +6시간 정밀 보정 */
export async function fetchUltraSrtFcst(query: GridQuery): Promise<KmaItem[]> {
  const cacheKey = `ufcst:${query.nx}:${query.ny}:${query.base.baseDate}${query.base.baseTime}`;
  const cached = readCache<KmaItem[]>(cacheKey);
  if (cached) return cached;

  const body = await fetchJson(
    buildUrl(VILAGE_SERVICE, "getUltraSrtFcst", {
      numOfRows: "300",
      pageNo: "1",
      base_date: query.base.baseDate,
      base_time: query.base.baseTime,
      nx: String(query.nx),
      ny: String(query.ny),
    }),
  );

  const { items } = extractItems(body);
  writeCache(cacheKey, items, CACHE_TTL_MS.ultra);
  return items;
}

interface WarnItem {
  stnId?: string | number;
  tmFc?: string | number;
  title?: string;
  t1?: string;
  t2?: string;
  t3?: string;
  t6?: string;
  t7?: string;
}

/**
 * 기상특보 현황.
 *
 * 두 포털이 특보만은 서로 다른 형태로 준다.
 * - 공공데이터포털: `WthrWrnInfoService/getWthrWrnList` (JSON, 관서 stnId 단위)
 * - 기상청 API 허브: 위 서비스를 "허용되지 않은 API"로 막고
 *   `typ01/url/wrn_now_data.php` 텍스트만 제공한다 (REG_KO 한글 지역명 포함)
 *
 * 어느 쪽이든 형식을 해석하지 못하면 값을 지어내지 않고 `parsed: false`를 돌려
 * 호출부가 "특보 확인 불가" 경고를 띄우게 한다. (CR-004 §9)
 */
export async function fetchWeatherAlerts(
  stnId: number,
  todayYmd: string,
  yesterdayYmd: string,
  address: string,
): Promise<ParsedAlerts> {
  const provider = resolveProvider();
  const bucket = Math.floor(Date.now() / CACHE_TTL_MS.warn);
  const cacheKey = `warn:${provider.authParam}:${stnId}:${normalizeRegionKey(address)}:${bucket}`;
  const cached = readCache<ParsedAlerts>(cacheKey);
  if (cached) return cached;

  const result =
    provider.authParam === "authKey"
      ? await fetchAlertsFromHub(provider, address)
      : await fetchAlertsFromPortal(stnId, todayYmd, yesterdayYmd);

  writeCache(cacheKey, result, CACHE_TTL_MS.warn);
  return result;
}

function normalizeRegionKey(address: string): string {
  return (address ?? "").replace(/\s+/g, "").slice(0, 10);
}

/** EUC-KR 디코드. Node·workerd 양쪽 TextDecoder가 이 라벨을 지원하는 것을 확인했다. */
function decodeEucKr(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("euc-kr").decode(buffer);
  } catch {
    // 라벨 미지원 런타임에서 깨진 한글로 오판하느니 빈 문자열로 파싱 실패를 알린다
    return "";
  }
}

/** API 허브 — 텍스트 응답이므로 JSON 파서를 태우지 않는다. */
async function fetchAlertsFromHub(
  provider: ResolvedProvider,
  address: string,
): Promise<ParsedAlerts> {
  // typ01 레거시 루트는 typ02 openApi 경로와 형제 관계다. baseUrl에 이어 붙이면 안 된다.
  const url = new URL(`${provider.legacyRoot}/wrn_now_data.php`);
  url.searchParams.set(provider.authParam, provider.key);
  url.searchParams.set("fe", "f");
  url.searchParams.set("disp", "0");
  url.searchParams.set("help", "1"); // 컬럼명 헤더를 받아 위치 추측을 피한다

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new KmaError("기상청 API 요청이 시간 초과되었거나 연결에 실패했습니다.");
  }

  // typ01 응답은 Content-Type: text/plain;charset=EUC-KR 이다.
  // response.text()로 읽으면 UTF-8로 해석해 한글이 전부 깨지고 지역 매칭이 실패한다.
  const buffer = await response.arrayBuffer();
  const text = decodeEucKr(buffer);

  // 오류는 텍스트가 아니라 JSON 봉투로 온다
  if (text.trim().startsWith("{")) {
    extractItems(JSON.parse(text) as KmaResponseBody);
    return { alerts: [], parsed: false };
  }
  if (!response.ok) {
    throw new KmaError(`기상청 API가 ${response.status} 상태를 반환했습니다.`);
  }

  return parseWrnNowText(text, address);
}

/** 공공데이터포털 — JSON */
async function fetchAlertsFromPortal(
  stnId: number,
  todayYmd: string,
  yesterdayYmd: string,
): Promise<ParsedAlerts> {
  const body = await fetchJson(
    buildUrl(WARN_SERVICE, "getWthrWrnList", {
      numOfRows: "50",
      pageNo: "1",
      stnId: String(stnId),
      fromTmFc: yesterdayYmd,
      toTmFc: todayYmd,
    }),
  );

  const { items } = extractItems(body);
  return parseAlerts(items as WarnItem[]);
}

const LEVEL_KEYWORDS = ["경보", "주의보"] as const;

export function parseAlerts(items: WarnItem[]): ParsedAlerts {
  if (items.length === 0) return { alerts: [], parsed: true };

  const alerts: WeatherAlert[] = [];
  let recognized = 0;

  for (const item of items) {
    const text = [item.title, item.t1, item.t2, item.t3, item.t6, item.t7]
      .filter(Boolean)
      .join(" ");
    if (!text) continue;

    const type = WARN_KEYWORDS.find((keyword) => text.includes(keyword));
    const level = LEVEL_KEYWORDS.find((keyword) => text.includes(keyword));
    if (!type || !level) continue;

    recognized += 1;
    alerts.push({
      type,
      level,
      region: String(item.t2 ?? item.t1 ?? "").slice(0, 40),
      issuedAt: String(item.tmFc ?? ""),
    });
  }

  // 항목은 왔는데 하나도 해석하지 못했다면 스키마가 예상과 다르다는 뜻이다
  return { alerts, parsed: recognized > 0 };
}

/**
 * 태풍 패널 데이터 — 태풍특보가 발효 중일 때만 만든다.
 *
 * CR-004 §2.5의 노출 조건 ①(태풍특보 발효)만 구현한다.
 * 조건 ②(활성 태풍 경로·중심기압)는 기상청 태풍정보 조회서비스 활용신청과
 * 응답 스키마 검증이 끝난 뒤 `detail`을 채우는 방식으로 확장한다.
 */
export function buildTyphoonFromAlerts(alerts: WeatherAlert[]): TyphoonInfo | null {
  const typhoonAlert = alerts.find((alert) => alert.type === "태풍");
  if (!typhoonAlert) return null;

  return {
    alertLevel: typhoonAlert.level,
    region: typhoonAlert.region,
    issuedAt: typhoonAlert.issuedAt,
    detail: null,
  };
}
