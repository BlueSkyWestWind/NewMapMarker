import { describe, expect, it, vi } from "vitest";
import {
  buildHttpGetRequest,
  concatChunks,
  decodeChunkedBody,
  findHeaderEnd,
  needsSocketTransport,
  parseHead,
  parseHttpResponse,
  readHttpResponse,
  type SocketLike,
} from "./http-over-socket";

const enc = (s: string) => new TextEncoder().encode(s);

/** 응답 조각을 순서대로 흘려보내는 가짜 소켓. 쓰기 내용과 close 호출 여부를 기록한다. */
function fakeSocket(responseParts: string[]) {
  const written: string[] = [];
  const closeWriter = vi.fn();

  const socket: SocketLike = {
    readable: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of responseParts) controller.enqueue(enc(part));
        controller.close();
      },
    }),
    writable: new WritableStream<Uint8Array>({
      write(chunk) {
        written.push(new TextDecoder().decode(chunk));
      },
      close() {
        closeWriter();
      },
    }),
  };

  return { socket, written, closeWriter };
}

describe("needsSocketTransport — 언제 소켓을 쓰는가", () => {
  it("비표준 포트면 소켓이 필요하다", () => {
    // Workers가 fetch에서 이 포트를 무시하고 443으로 붙어버린다
    expect(needsSocketTransport(new URL("https://openapi.its.go.kr:9443/x"))).toBe(true);
    expect(needsSocketTransport(new URL("http://host:8080/x"))).toBe(true);
  });

  it("표준 포트면 fetch로 충분하다", () => {
    expect(needsSocketTransport(new URL("https://a.com/x"))).toBe(false);
    expect(needsSocketTransport(new URL("https://a.com:443/x"))).toBe(false);
    expect(needsSocketTransport(new URL("http://a.com:80/x"))).toBe(false);
  });
});

describe("buildHttpGetRequest", () => {
  const req = buildHttpGetRequest(new URL("https://openapi.its.go.kr:9443/cctvInfo?a=1&b=2"));

  it("경로와 쿼리를 그대로 넣는다", () => {
    expect(req.startsWith("GET /cctvInfo?a=1&b=2 HTTP/1.1\r\n")).toBe(true);
  });

  it("Host에 포트를 포함한다", () => {
    expect(req).toContain("Host: openapi.its.go.kr:9443\r\n");
  });

  it("Connection: close — 연결 종료로 본문 끝을 판단한다", () => {
    expect(req).toContain("Connection: close\r\n");
  });

  it("압축을 받지 않는다 — 직접 파싱하므로", () => {
    expect(req).toContain("Accept-Encoding: identity\r\n");
  });

  it("헤더가 빈 줄로 끝난다", () => {
    expect(req.endsWith("\r\n\r\n")).toBe(true);
  });
});

describe("findHeaderEnd", () => {
  it("헤더·본문 경계를 찾는다", () => {
    const raw = enc("HTTP/1.1 200 OK\r\nA: b\r\n\r\nBODY");
    expect(findHeaderEnd(raw)).toBe(enc("HTTP/1.1 200 OK\r\nA: b").length);
  });

  it("경계가 없으면 -1", () => {
    expect(findHeaderEnd(enc("HTTP/1.1 200 OK\r\nA: b"))).toBe(-1);
  });
});

describe("parseHead", () => {
  it("상태코드와 헤더를 뽑는다", () => {
    const h = parseHead("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nX-A: 1");
    expect(h.status).toBe(200);
    expect(h.headers["content-type"]).toBe("application/json");
  });

  it("헤더명을 소문자로 정규화한다", () => {
    expect(parseHead("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked").headers["transfer-encoding"])
      .toBe("chunked");
  });

  it("상태코드를 못 읽으면 0", () => {
    expect(parseHead("이상한 응답").status).toBe(0);
  });

  it("값에 콜론이 있어도 첫 콜론만 구분자로 쓴다", () => {
    expect(parseHead("HTTP/1.1 200 OK\r\nLocation: https://a.com:9443/x").headers.location)
      .toBe("https://a.com:9443/x");
  });
});

describe("decodeChunkedBody", () => {
  it("청크를 이어붙인다", () => {
    const body = enc("5\r\nHello\r\n5\r\nWorld\r\n0\r\n\r\n");
    expect(new TextDecoder().decode(decodeChunkedBody(body))).toBe("HelloWorld");
  });

  it("16진수 길이를 해석한다", () => {
    const payload = "x".repeat(255);
    const body = enc(`ff\r\n${payload}\r\n0\r\n\r\n`);
    expect(decodeChunkedBody(body).length).toBe(255);
  });

  it("청크 확장(;로 시작)을 무시한다", () => {
    const body = enc("5;ext=1\r\nHello\r\n0\r\n\r\n");
    expect(new TextDecoder().decode(decodeChunkedBody(body))).toBe("Hello");
  });

  it("종료 청크(0)에서 멈춘다", () => {
    const body = enc("3\r\nabc\r\n0\r\n\r\n3\r\nxyz\r\n");
    expect(new TextDecoder().decode(decodeChunkedBody(body))).toBe("abc");
  });

  it("빈 본문", () => {
    expect(decodeChunkedBody(enc("0\r\n\r\n")).length).toBe(0);
  });
});

describe("parseHttpResponse — 전체 흐름", () => {
  it("Content-Length 방식 응답", () => {
    const raw = enc(
      'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 13\r\n\r\n{"ok":true}\r\n',
    );
    const r = parseHttpResponse(raw);

    expect(r.status).toBe(200);
    expect(r.text.trim()).toBe('{"ok":true}');
  });

  it("chunked 응답을 풀어서 JSON으로 만든다", () => {
    // 풀지 않으면 JSON 중간에 길이 표시가 섞여 파싱이 깨진다
    const raw = enc(
      "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n" +
        '6\r\n{"a":1\r\n2\r\n}\n\r\n0\r\n\r\n',
    );
    const r = parseHttpResponse(raw);

    expect(r.status).toBe(200);
    expect(r.text.trim()).toBe('{"a":1}');
    expect(JSON.parse(r.text)).toEqual({ a: 1 });
  });

  it("401 등 오류 상태도 그대로 전달한다", () => {
    const raw = enc(
      'HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\n\r\n{"header":{"resultCode":4005}}',
    );
    const r = parseHttpResponse(raw);

    expect(r.status).toBe(401);
    expect(JSON.parse(r.text).header.resultCode).toBe(4005);
  });

  it("헤더 경계를 못 찾으면 전체를 본문으로 본다", () => {
    const r = parseHttpResponse(enc("깨진 응답"));
    expect(r.status).toBe(0);
    expect(r.text).toBe("깨진 응답");
  });

  it("본문이 여러 조각으로 나뉘어 와도 이어붙인 뒤 파싱된다", () => {
    const parts = [
      enc("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n"),
      enc('\r\n{"data":'),
      enc("[1,2,3]}"),
    ];
    const r = parseHttpResponse(concatChunks(parts));

    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toEqual({ data: [1, 2, 3] });
  });
});

describe("readHttpResponse — 소켓 구동", () => {
  it("요청을 그대로 써 보낸다", async () => {
    const { socket, written } = fakeSocket(["HTTP/1.1 200 OK\r\n\r\nok"]);
    await readHttpResponse(socket, "GET /x HTTP/1.1\r\nHost: a\r\n\r\n");

    expect(written.join("")).toBe("GET /x HTTP/1.1\r\nHost: a\r\n\r\n");
  });

  it("writer를 닫지 않는다 — 닫으면 연결 전체가 끊겨 응답을 못 받는다", async () => {
    // 실제 workerd에서 writer.close() 때문에 0바이트만 받고 끝났던 회귀
    const { socket, closeWriter } = fakeSocket(["HTTP/1.1 200 OK\r\n\r\nok"]);
    await readHttpResponse(socket, "GET / HTTP/1.1\r\n\r\n");

    expect(closeWriter).not.toHaveBeenCalled();
  });

  it("다 읽은 뒤 스트림 락을 놓는다 — 잠긴 채로 두면 socket.close()가 실패한다", async () => {
    const { socket } = fakeSocket(["HTTP/1.1 200 OK\r\n\r\nok"]);
    await readHttpResponse(socket, "GET / HTTP/1.1\r\n\r\n");

    expect(socket.readable.locked).toBe(false);
    expect(socket.writable.locked).toBe(false);
  });

  it("읽는 중 오류가 나도 락을 놓는다", async () => {
    const socket: SocketLike = {
      readable: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("Stream was cancelled."));
        },
      }),
      writable: new WritableStream<Uint8Array>(),
    };

    await expect(readHttpResponse(socket, "GET / HTTP/1.1\r\n\r\n")).rejects.toThrow(
      "Stream was cancelled.",
    );
    expect(socket.readable.locked).toBe(false);
  });

  it("여러 조각으로 나뉘어 온 응답을 이어붙여 파싱한다", async () => {
    const { socket } = fakeSocket([
      "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n",
      '\r\n{"response":{"data":',
      "[1,2]}}",
    ]);
    const res = await readHttpResponse(socket, "GET / HTTP/1.1\r\n\r\n");

    expect(res.status).toBe(200);
    expect(JSON.parse(res.text)).toEqual({ response: { data: [1, 2] } });
  });

  it("chunked 응답도 풀어서 돌려준다", async () => {
    const { socket } = fakeSocket([
      "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n",
      '6\r\n{"a":1\r\n',
      "1\r\n}\r\n0\r\n\r\n",
    ]);
    const res = await readHttpResponse(socket, "GET / HTTP/1.1\r\n\r\n");

    expect(JSON.parse(res.text)).toEqual({ a: 1 });
  });
});

describe("concatChunks", () => {
  it("순서를 지켜 이어붙인다", () => {
    const out = concatChunks([enc("ab"), enc("cd"), enc("ef")]);
    expect(new TextDecoder().decode(out)).toBe("abcdef");
  });

  it("빈 배열", () => {
    expect(concatChunks([]).length).toBe(0);
  });
});
