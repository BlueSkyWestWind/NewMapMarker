import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const recordKmaCall = vi.fn();
vi.mock("./kma-usage", () => ({
  recordKmaCall: (input: unknown) => recordKmaCall(input),
}));

import { clearKmaCache, fetchUltraSrtNcst } from "./kma-client";

const query = { nx: 60, ny: 127, base: { baseDate: "20261109", baseTime: "1400" } };

const okBody = {
  response: {
    header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
    body: { totalCount: 1, items: { item: [{ category: "T1H", obsrValue: "10" }] } },
  },
};

function mockFetchJson(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

beforeEach(() => {
  clearKmaCache();
  recordKmaCall.mockReset();
  vi.stubEnv("KMA_API_HUB_KEY", "test-hub-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("kma-client 호출 집계", () => {
  it("실제 요청 1건당 정확히 1번 기록한다(포털·호출 종류·출처 포함)", async () => {
    vi.stubGlobal("fetch", mockFetchJson(okBody));

    await fetchUltraSrtNcst(query);

    expect(recordKmaCall).toHaveBeenCalledTimes(1);
    expect(recordKmaCall).toHaveBeenCalledWith({
      provider: "apihub",
      operation: "getUltraSrtNcst",
      source: "user",
      error: null,
    });
  });

  it("캐시가 맞으면 요청이 나가지 않으므로 기록하지 않는다", async () => {
    const fetchMock = mockFetchJson(okBody);
    vi.stubGlobal("fetch", fetchMock);

    await fetchUltraSrtNcst(query);
    await fetchUltraSrtNcst(query);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recordKmaCall).toHaveBeenCalledTimes(1);
  });

  it("fresh면 캐시가 있어도 요청을 보내고 manual 출처로 기록한다", async () => {
    // 호출마다 새 Response가 필요하다(본문은 한 번만 읽을 수 있다)
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(okBody), { status: 200, headers: { "Content-Type": "application/json" } })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchUltraSrtNcst(query);
    await fetchUltraSrtNcst(query, { source: "manual", fresh: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(recordKmaCall).toHaveBeenLastCalledWith(expect.objectContaining({ source: "manual" }));
  });

  it("fresh로 받은 결과는 캐시에 다시 쓴다(이후 일반 호출은 요청을 보내지 않는다)", async () => {
    const fetchMock = mockFetchJson(okBody);
    vi.stubGlobal("fetch", fetchMock);

    await fetchUltraSrtNcst(query, { fresh: true });
    await fetchUltraSrtNcst(query);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("사전 수집 출처를 구분해 기록한다", async () => {
    vi.stubGlobal("fetch", mockFetchJson(okBody));

    await fetchUltraSrtNcst(query, { source: "prefetch" });

    expect(recordKmaCall).toHaveBeenCalledWith(expect.objectContaining({ source: "prefetch" }));
  });

  it("연결 실패는 timeout 코드로 기록하고 예외는 그대로 던진다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    await expect(fetchUltraSrtNcst(query)).rejects.toThrow();

    expect(recordKmaCall).toHaveBeenCalledTimes(1);
    expect(recordKmaCall).toHaveBeenCalledWith(expect.objectContaining({ error: "timeout" }));
  });

  it("본문이 한도 초과(22) 오류 봉투여도 실패 코드로 기록한다", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({ response: { header: { resultCode: "22", resultMsg: "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR" } } }),
    );

    await expect(fetchUltraSrtNcst(query)).rejects.toThrow();

    expect(recordKmaCall).toHaveBeenCalledWith(expect.objectContaining({ error: "22" }));
  });

  it("던져진 KmaError에 본문 오류 코드가 실린다(한도 22)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({ response: { header: { resultCode: "22", resultMsg: "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR" } } }),
    );

    await expect(fetchUltraSrtNcst(query)).rejects.toMatchObject({ code: "22" });
  });

  it("키 오류(30)는 코드 401로 실린다", async () => {
    vi.stubGlobal("fetch", mockFetchJson({ response: { header: { resultCode: "30", resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" } } }));

    await expect(fetchUltraSrtNcst(query)).rejects.toMatchObject({ code: "401" });
  });

  it("허브 403 봉투는 코드 403으로 실린다", async () => {
    vi.stubGlobal("fetch", mockFetchJson({ result: { status: 403, message: "forbidden" } }));

    await expect(fetchUltraSrtNcst(query)).rejects.toMatchObject({ code: "403" });
  });

  it("데이터 없음(03)은 정상 호출로 센다", async () => {
    vi.stubGlobal("fetch", mockFetchJson({ response: { header: { resultCode: "03", resultMsg: "NODATA_ERROR" } } }));

    await fetchUltraSrtNcst(query);

    expect(recordKmaCall).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });
});
