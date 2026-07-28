/**
 * TCP 소켓 위에서 HTTP/1.1 GET을 직접 수행한다.
 *
 * **왜 이런 걸 만드는가**
 * Cloudflare Workers는 배포 환경에서 `fetch()`의 **비표준 포트를 무시하고 443으로 붙는다.**
 * ITS CCTV API는 `openapi.its.go.kr:9443`에서만 서비스하므로(443·8443은 닫혀 있음)
 * 배포본에서는 `fetch`로 도달할 수 없다.
 * `cloudflare:sockets`의 `connect()`는 임의 포트에 TLS 연결이 되므로 이것이 유일한 경로다.
 *
 * 파싱 로직은 순수 함수로 분리해 테스트한다. 소켓 부분만 런타임 의존이다.
 */

const CRLF = "\r\n";
const HEADER_END = new Uint8Array([13, 10, 13, 10]); // \r\n\r\n

export function buildHttpGetRequest(url: URL): string {
  const path = `${url.pathname}${url.search}`;
  return [
    `GET ${path} HTTP/1.1`,
    `Host: ${url.host}`,
    "Accept: application/json",
    "Accept-Encoding: identity", // 직접 파싱하므로 압축을 받지 않는다
    "User-Agent: MapMarkerPro/1.1",
    // keep-alive를 쓰면 본문 끝을 판단하기 위해 연결 재사용까지 다뤄야 한다
    "Connection: close",
    "",
    "",
  ].join(CRLF);
}

export function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** 헤더와 본문 경계(`\r\n\r\n`) 위치. 못 찾으면 -1 */
export function findHeaderEnd(bytes: Uint8Array): number {
  outer: for (let i = 0; i + HEADER_END.length <= bytes.length; i += 1) {
    for (let j = 0; j < HEADER_END.length; j += 1) {
      if (bytes[i + j] !== HEADER_END[j]) continue outer;
    }
    return i;
  }
  return -1;
}

export interface ParsedHead {
  status: number;
  headers: Record<string, string>;
}

export function parseHead(headText: string): ParsedHead {
  const lines = headText.split(/\r?\n/);
  const statusLine = lines[0] ?? "";
  // "HTTP/1.1 200 OK"
  const status = Number.parseInt(statusLine.split(" ")[1] ?? "", 10);

  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }

  return { status: Number.isFinite(status) ? status : 0, headers };
}

/**
 * `Transfer-Encoding: chunked` 본문을 푼다.
 *
 * 형식: `<16진수 길이>\r\n<데이터>\r\n` 반복, `0\r\n\r\n`으로 종료.
 * 이걸 처리하지 않으면 JSON 중간에 길이 표시가 섞여 파싱이 깨진다.
 */
export function decodeChunkedBody(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let pos = 0;

  while (pos < bytes.length) {
    // 길이 줄의 끝(\r\n)을 찾는다
    let lineEnd = -1;
    for (let i = pos; i + 1 < bytes.length; i += 1) {
      if (bytes[i] === 13 && bytes[i + 1] === 10) {
        lineEnd = i;
        break;
      }
    }
    if (lineEnd < 0) break;

    const sizeLine = new TextDecoder().decode(bytes.subarray(pos, lineEnd));
    // 청크 확장(";" 뒤)은 무시한다
    const size = Number.parseInt(sizeLine.split(";")[0].trim(), 16);
    if (!Number.isFinite(size) || size <= 0) break;

    const dataStart = lineEnd + 2;
    const dataEnd = Math.min(dataStart + size, bytes.length);
    parts.push(bytes.subarray(dataStart, dataEnd));

    pos = dataEnd + 2; // 데이터 뒤의 \r\n 건너뛰기
  }

  return concatChunks(parts);
}

export interface SocketResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
}

/** 수신 바이트 전체 → 상태·헤더·본문 문자열 */
export function parseHttpResponse(raw: Uint8Array): SocketResponse {
  const headEnd = findHeaderEnd(raw);
  if (headEnd < 0) {
    return { status: 0, headers: {}, text: new TextDecoder().decode(raw) };
  }

  const head = parseHead(new TextDecoder().decode(raw.subarray(0, headEnd)));
  let body = raw.subarray(headEnd + HEADER_END.length);

  if ((head.headers["transfer-encoding"] ?? "").toLowerCase().includes("chunked")) {
    body = decodeChunkedBody(body);
  }

  return { ...head, text: new TextDecoder().decode(body) };
}

/** 소켓을 쓸 수 없는 런타임(로컬 Node 등)임을 알리는 전용 오류. 호출부가 fetch로 되돌린다. */
export class SocketUnavailableError extends Error {
  constructor() {
    super("이 런타임에서는 cloudflare:sockets를 사용할 수 없습니다.");
    this.name = "SocketUnavailableError";
  }
}

type ConnectFn = (typeof import("cloudflare:sockets"))["connect"];

/**
 * `connect`를 가져온다. 없으면 null.
 *
 * 실패 원인을 **오류 메시지로 판별하지 않는다.** Node와 Workers가 서로 다른 문구를 내며
 * (Node: "Only URLs with a scheme in: file, data, and node are supported…")
 * 문구가 바뀌면 폴백이 조용히 깨진다. 로드 성공 여부만 본다.
 */
async function loadConnect(): Promise<ConnectFn | null> {
  try {
    // Workers 런타임 내장 모듈이라 번들러가 해석하면 안 된다.
    // 표시가 없으면 `UnhandledSchemeError: cloudflare:sockets`로 빌드가 깨진다.
    const mod = await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ "cloudflare:sockets"
    );
    return mod?.connect ?? null;
  } catch {
    return null;
  }
}

/** 응답 본문이 커질 수 있어 상한을 둔다 (ITS 전남 전체가 약 150KB) */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

/** 소켓에서 쓰는 부분만 추린 형태. 테스트에서 가짜 소켓을 넣기 위한 것이다. */
export interface SocketLike {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}

/**
 * 열린 소켓에 요청을 쓰고 응답 전체를 읽는다.
 *
 * **writer를 닫지 않는다.** `connect()`는 쓰기 쪽이 닫히면 연결 전체를 끊기 때문에
 * (`allowHalfOpen: true`로도 마찬가지였다) `writer.close()`를 부르면
 * 응답을 한 바이트도 못 받고 `Network connection lost.`로 끝난다.
 * 실제 workerd에서 확인했다(2026-07-28). 요청의 끝은 헤더 뒤 빈 줄이 알리고,
 * 응답의 끝은 `Connection: close`에 따라 서버가 연결을 닫는 시점이다.
 */
export async function readHttpResponse(
  socket: SocketLike,
  request: string,
): Promise<SocketResponse> {
  const writer = socket.writable.getWriter();
  try {
    await writer.write(new TextEncoder().encode(request));
  } finally {
    writer.releaseLock();
  }

  const reader = socket.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    chunks.push(value);
    total += value.length;
    if (total > MAX_RESPONSE_BYTES) {
      throw new Error("응답이 너무 큽니다.");
    }
  }

  return parseHttpResponse(concatChunks(chunks));
}

/**
 * TLS 소켓으로 GET을 보내고 응답 전체를 받는다.
 */
export async function httpGetOverSocket(
  url: URL,
  timeoutMs: number,
): Promise<SocketResponse> {
  const connect = await loadConnect();
  if (!connect) throw new SocketUnavailableError();

  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  const socket = connect(
    { hostname: url.hostname, port },
    { secureTransport: url.protocol === "https:" ? "on" : "off" },
  );

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("소켓 요청 시간 초과")), timeoutMs);
  });

  try {
    return await Promise.race([readHttpResponse(socket, buildHttpGetRequest(url)), timeout]);
  } finally {
    // 타임아웃으로 빠져나온 경우에도 연결을 반드시 정리한다
    await socket.close().catch(() => {});
  }
}

/** Workers 런타임에서만 소켓 경로를 쓴다. Node(로컬)에서는 fetch가 포트를 지킨다. */
export function needsSocketTransport(url: URL): boolean {
  const port = url.port;
  if (!port) return false;
  if (url.protocol === "https:" && port === "443") return false;
  if (url.protocol === "http:" && port === "80") return false;
  return true;
}
