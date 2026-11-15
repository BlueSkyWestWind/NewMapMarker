import { describe, expect, it } from "vitest";
import {
  buildGeocodeCandidates,
  classifyKoreanAddress,
  splitAddressFields,
} from "./geocode";

describe("classifyKoreanAddress", () => {
  it("도로명 주소(로/길 + 건물번호)는 road로 판별한다", () => {
    // 출처: geocode.ts 주석 사례 ("예: 테헤란로 152") 및 도로명 '길' 형태
    expect(classifyKoreanAddress("서울특별시 강남구 테헤란로 152")).toBe("road");
    expect(classifyKoreanAddress("서울특별시 종로구 종로 12길 5")).toBe("road");
  });

  it("지번 주소(리·산·번지·번호 뒤 가)와 빈 입력은 jibun으로 판별한다", () => {
    // 출처: geocode.ts 주석 사례 ("명산리 114-4", "산 30-1", "…번지", "을지로 2가", "애매하면 지번")
    expect(classifyKoreanAddress("전남 광양시 명산리 114-4")).toBe("jibun");
    expect(classifyKoreanAddress("전남 광양시 광영동 산 30-1")).toBe("jibun");
    expect(classifyKoreanAddress("광주광역시 북구 두암동 123번지")).toBe("jibun");
    expect(classifyKoreanAddress("서울 중구 을지로 2가")).toBe("jibun");
    expect(classifyKoreanAddress("")).toBe("jibun");
    expect(classifyKoreanAddress("   ")).toBe("jibun");
  });

  it("'번지'가 있으면 도로명처럼 보여도 지번이다(지번 강한 신호 우선)", () => {
    // 출처: geocode.ts 주석 "지번 강한 신호 우선", "…번지". '번지' 앞에 공백이 있으면 도로명 정규식(로/길 + 번호)이
    // 먼저 맞아 road가 되므로, 이 입력은 '번지' 검사가 있어야만 jibun이 된다(변이 확인으로 증명).
    expect(classifyKoreanAddress("광주 북구 중앙로 12 번지")).toBe("jibun");
    expect(classifyKoreanAddress("서울 강남구 테헤란로 152 번지")).toBe("jibun");
  });
});

describe("buildGeocodeCandidates", () => {
  it("빈 문자열이나 공백만 있으면 빈 배열을 반환한다", () => {
    // 출처: geocode.ts buildGeocodeCandidates ("!base → []")
    expect(buildGeocodeCandidates("")).toEqual([]);
    expect(buildGeocodeCandidates("   ")).toEqual([]);
  });

  it("일반 지번과 산 지번을 원본 우선으로 토글해 후보를 만든다", () => {
    // 출처: geocode.ts toggleSanNotation 주석 ("광영동 산 30-1" ↔ "광영동 30-1")
    expect(buildGeocodeCandidates("광영동 30-1")).toEqual([
      "광영동 30-1",
      "광영동 산 30-1",
    ]);
    expect(buildGeocodeCandidates("광영동 산 30-1")).toEqual([
      "광영동 산 30-1",
      "광영동 30-1",
    ]);
  });

  it("'번지' 접미사가 있으면 원본·번지 제거본과 각각의 산 토글본을 중복 없이 만든다", () => {
    // 출처: geocode.ts buildGeocodeCandidates 주석 ("원본 → 번지 접미사 제거 → 산/일반 지번 토글")
    expect(buildGeocodeCandidates("광양시 명산리 114-4번지")).toEqual([
      "광양시 명산리 114-4번지",
      "광양시 명산리 산 114-4번지",
      "광양시 명산리 114-4",
      "광양시 명산리 산 114-4",
    ]);
  });
});

describe("splitAddressFields", () => {
  it("둘 다 비고 address만 있으면 도로명/지번을 판별해 나눈다", () => {
    // 출처: geocode.ts splitAddressFields 주석 ("roadAddress/jibunAddress가 비어 있고 address만 있을 때")
    expect(splitAddressFields({ address: "  서울특별시 강남구 테헤란로 152  " })).toEqual({
      roadAddress: "서울특별시 강남구 테헤란로 152",
      jibunAddress: "",
    });
    expect(splitAddressFields({ address: "전남 광양시 명산리 114-4" })).toEqual({
      roadAddress: "",
      jibunAddress: "전남 광양시 명산리 114-4",
    });
  });

  it("이미 roadAddress나 jibunAddress가 있으면 address를 쓰지 않고 앞뒤 공백만 정리한다", () => {
    // 출처: geocode.ts splitAddressFields 주석 ("비어 있고 address만 있을 때")
    expect(
      splitAddressFields({
        roadAddress: "  서울특별시 강남구 테헤란로 152 ",
        address: "전남 광양시 명산리 114-4",
      }),
    ).toEqual({
      roadAddress: "서울특별시 강남구 테헤란로 152",
      jibunAddress: "",
    });
  });
});
