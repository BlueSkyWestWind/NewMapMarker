import { describe, expect, it, vi } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import { pickMarkerAddressDisplay, pickRoadAddressDisplay, saveMarkerAddress } from "./marker-address";

function fakeSupabase(error: unknown = null) {
  const eq = vi.fn().mockResolvedValue({ error });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { client: { from } as unknown as SupabaseBrowserClient, from, update, eq };
}

describe("saveMarkerAddress", () => {
  it("markers 행의 marker_address를 갱신한다", async () => {
    const { client, from, update, eq } = fakeSupabase();
    await expect(saveMarkerAddress(client, "erp_A", " 광주 북구 운암동 1 ")).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith("markers");
    expect(update).toHaveBeenCalledWith({ marker_address: "광주 북구 운암동 1" });
    expect(eq).toHaveBeenCalledWith("id", "erp_A");
  });

  it("빈 주소를 주면 마커주소를 비운다(옮긴 뒤 옛 주소가 남지 않게)", async () => {
    const { client, update } = fakeSupabase();
    await expect(saveMarkerAddress(client, "erp_A", "  ")).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith({ marker_address: "" });
  });

  it("컬럼이 없는 DB처럼 오류가 나면 false를 돌려준다(던지지 않는다)", async () => {
    const { client } = fakeSupabase({ code: "PGRST204", message: "Could not find the 'marker_address' column" });
    await expect(saveMarkerAddress(client, "erp_A", "광주")).resolves.toBe(false);
  });
});

describe("pickMarkerAddressDisplay — 마커주소 표시", () => {
  const registered = { jibunAddress: "전남광주통합특별시 북구 삼각동 700번지", roadAddress: "" };
  const actual = { address: "광주광역시 북구 삼각동 700" };

  it("저장된 마커주소가 있으면 그것을 보여 준다", () => {
    expect(
      pickMarkerAddressDisplay({ stored: "저장된 주소", registered, actual, isSame: true }),
    ).toEqual({ text: "저장된 주소", source: "stored" });
  });

  it("저장된 값이 없고 마커 위치가 등록 주소와 같은 곳이면 지번 주소를 보여 준다", () => {
    expect(pickMarkerAddressDisplay({ stored: "", registered, actual, isSame: true })).toEqual({
      text: "전남광주통합특별시 북구 삼각동 700번지",
      source: "registered",
    });
  });

  it("지번이 없으면 같은 곳일 때 신주소를 보여 준다", () => {
    expect(
      pickMarkerAddressDisplay({
        stored: "",
        registered: { jibunAddress: "", roadAddress: "광주 북구 첨단과기로 123" },
        actual,
        isSame: true,
      }),
    ).toEqual({ text: "광주 북구 첨단과기로 123", source: "registered" });
  });

  it("다른 곳이면 좌표의 실제 주소를 보여 준다", () => {
    expect(pickMarkerAddressDisplay({ stored: "", registered, actual, isSame: false })).toEqual({
      text: "광주광역시 북구 삼각동 700",
      source: "actual",
    });
  });

  it("좌표의 주소를 못 구하면 보여 줄 주소가 없다", () => {
    expect(
      pickMarkerAddressDisplay({ stored: "  ", registered, actual: null, isSame: false }),
    ).toEqual({ text: "", source: "none" });
  });

  it("같은 곳이라도 등록 주소가 둘 다 비어 있으면 실제 주소를 보여 준다", () => {
    expect(
      pickMarkerAddressDisplay({
        stored: "",
        registered: { jibunAddress: "", roadAddress: "" },
        actual,
        isSame: true,
      }),
    ).toEqual({ text: "광주광역시 북구 삼각동 700", source: "actual" });
  });
});

describe("pickRoadAddressDisplay — 도로명 주소 표시", () => {
  const actual = { roadAddress: "광주광역시 북구 삼각로 12" };

  it("저장된 도로명 주소가 있으면 그것을 보여 준다", () => {
    expect(pickRoadAddressDisplay({ stored: "저장된 도로명", actual, isSame: true })).toEqual({
      text: "저장된 도로명",
      source: "stored",
    });
  });

  it("저장된 값이 없고 마커가 등록 주소와 같은 곳이면 좌표의 도로명 주소를 보여 준다", () => {
    expect(pickRoadAddressDisplay({ stored: "", actual, isSame: true })).toEqual({
      text: "광주광역시 북구 삼각로 12",
      source: "actual",
    });
  });

  it("마커가 다른 곳이면 그 도로명 주소는 이 국소의 것이 아니라 보여 주지 않는다", () => {
    expect(pickRoadAddressDisplay({ stored: "", actual, isSame: false })).toEqual({
      text: "",
      source: "none",
    });
  });

  it("좌표에 도로명 주소가 없으면(산·외곽 등) 보여 줄 주소가 없다", () => {
    expect(
      pickRoadAddressDisplay({ stored: "", actual: { roadAddress: "  " }, isSame: true }),
    ).toEqual({ text: "", source: "none" });
  });

  it("좌표의 주소를 못 구했으면 보여 줄 주소가 없다", () => {
    expect(pickRoadAddressDisplay({ stored: " ", actual: null, isSame: true })).toEqual({
      text: "",
      source: "none",
    });
  });
});
