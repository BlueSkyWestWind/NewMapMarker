import { describe, expect, it } from "vitest";
import { isSameAddress } from "./address-compare";

const actual = (jibunAddress: string, roadAddress = "") => ({
  jibunAddress,
  roadAddress,
});

describe("isSameAddress", () => {
  it("시도 표기와 번지 접미사가 달라도 같은 지번이면 같다", () => {
    expect(
      isSameAddress(
        "광주광역시 북구 운암동 123-4번지",
        actual("광주 북구 운암동 123-4"),
      ),
    ).toBe(true);
  });

  it("실제 공정 파일의 통합특별시 표기와 카카오 표기를 같게 본다", () => {
    expect(
      isSameAddress(
        "전남광주통합특별시 담양군 수북면 대방리 955-64번지",
        actual("전남 담양군 수북면 대방리 955-64"),
      ),
    ).toBe(true);
    expect(
      isSameAddress(
        "전남광주통합특별시 북구 두암동 288-34번지",
        actual("광주 북구 두암동 288-34"),
      ),
    ).toBe(true);
  });

  it("지번 뒤의 건물 정보는 비교하지 않는다", () => {
    expect(
      isSameAddress(
        "광주광역시 북구 운암동 123-4 103동 201호",
        actual("광주 북구 운암동 123-4"),
      ),
    ).toBe(true);
  });

  it("번지가 다르면 다르다", () => {
    expect(
      isSameAddress("광주 북구 운암동 123-4", actual("광주 북구 운암동 123-5")),
    ).toBe(false);
    expect(
      isSameAddress("광주 북구 운암동 123", actual("광주 북구 운암동 123-1")),
    ).toBe(false);
  });

  it("동이 다르면 다르다", () => {
    expect(
      isSameAddress("광주 북구 운암동 123", actual("광주 북구 동림동 123")),
    ).toBe(false);
  });

  it("산 지번과 일반 지번은 다르다", () => {
    expect(
      isSameAddress("광양시 광영동 산 30-1", actual("전남 광양시 광영동 30-1")),
    ).toBe(false);
    expect(
      isSameAddress("광양시 광영동 산30-1", actual("전남 광양시 광영동 산 30-1")),
    ).toBe(true);
  });

  it("엑셀에 있는 시군구가 다르면 다르다", () => {
    expect(
      isSameAddress("광주 북구 중앙동 10", actual("광주 동구 중앙동 10")),
    ).toBe(false);
  });

  it("엑셀에 시군구가 없으면 동과 지번만 비교한다", () => {
    expect(isSameAddress("운암동 123", actual("광주 북구 운암동 123"))).toBe(true);
  });

  it("도로명 주소는 도로명과 건물번호를 비교한다", () => {
    const here = actual("서울 강남구 역삼동 737", "서울 강남구 테헤란로 152");
    expect(isSameAddress("서울특별시 강남구 테헤란로 152", here)).toBe(true);
    expect(isSameAddress("서울특별시 강남구 테헤란로 153", here)).toBe(false);
  });

  it("번길 도로명을 비교한다", () => {
    const here = actual("", "경기 성남시 분당구 판교로 12번길 5");
    expect(isSameAddress("경기도 성남시 분당구 판교로12번길 5", here)).toBe(true);
  });

  it("좌표의 도로명 주소가 없으면 도로명 엑셀 주소는 비교할 수 없어 다르다", () => {
    expect(
      isSameAddress("서울 강남구 테헤란로 152", actual("서울 강남구 역삼동 737")),
    ).toBe(false);
  });

  it("해석할 수 없거나 좌표의 주소가 없으면 다르다", () => {
    expect(isSameAddress("광주 북구 어딘가", actual("광주 북구 운암동 1"))).toBe(false);
    expect(isSameAddress("", actual("광주 북구 운암동 1"))).toBe(false);
    expect(isSameAddress("광주 북구 운암동 1", null)).toBe(false);
  });
});
