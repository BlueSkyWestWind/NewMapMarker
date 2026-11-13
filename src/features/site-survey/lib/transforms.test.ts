import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../constants/default-settings";
import {
  applyAliases,
  formatAddress,
  formatRound,
  joinParts,
  regionDetailOf,
  regionOf,
  siteNameOf,
  stripTrailingS,
} from "./transforms";

describe("formatRound", () => {
  it("N차를 YY-NN으로 바꾼다", () => {
    expect(formatRound("5차", "2026")).toBe("26-05");
    expect(formatRound("12차", "2026")).toBe("26-12");
  });
  it("비었거나 차수 모양이 아니면 그대로 둔다", () => {
    expect(formatRound("", "2026")).toBe("");
    expect(formatRound("미확정", "2026")).toBe("미확정");
  });
});

describe("formatAddress", () => {
  it("구주소 뒤에 번지를 붙인다", () => {
    expect(formatAddress("전남광주통합특별시 무안군 일로읍 오룡리", "437번지", true)).toBe(
      "전남광주통합특별시 무안군 일로읍 오룡리 437번지",
    );
    expect(formatAddress("광주 서구 화정동", "23-27번지", true)).toBe("광주 서구 화정동 23-27번지");
    expect(formatAddress("전남 광양시 금호동", "631", true)).toBe("전남 광양시 금호동 631번지");
  });
  it("번지가 이미 번지로 끝나면 다시 붙이지 않는다", () => {
    expect(formatAddress("전남 여수시 돌산읍", "198-1번지", true)).toBe("전남 여수시 돌산읍 198-1번지");
  });
  it("번지가 비면 구주소만 쓴다", () => {
    expect(formatAddress("전남 여수시 돌산읍", "", true)).toBe("전남 여수시 돌산읍");
  });
  it("appendBeonji가 꺼져 있으면 그대로 붙인다", () => {
    expect(formatAddress("전남 여수시 돌산읍", "327-6", false)).toBe("전남 여수시 돌산읍 327-6");
  });
});

describe("stripTrailingS", () => {
  it("숫자 뒤의 S를 지운다", () => {
    expect(stripTrailingS("1S", true)).toBe("1");
    expect(stripTrailingS("3S", true)).toBe("3");
  });
  it("꺼져 있거나 숫자+S 모양이 아니면 그대로다", () => {
    expect(stripTrailingS("1S", false)).toBe("1S");
    expect(stripTrailingS("OMNI", true)).toBe("OMNI");
    expect(stripTrailingS("S", true)).toBe("S");
    expect(stripTrailingS("", true)).toBe("");
  });
});

describe("regionOf / regionDetailOf", () => {
  const map = DEFAULT_SETTINGS.address.regionMap;
  const cases: [string, string][] = [
    ["전남광주통합특별시 광산구 수완동", "전남"],
    ["광주 여수시 돌산읍", "전남"],
    ["전남 무안군", "전남"],
    ["전북 군산시", "전북"],
    ["전북특별자치도 군산시", "전북"],
    ["제주시 노형동", "제주"],
    ["서귀포시 성산읍", "제주"],
    ["서울 강남구", ""],
  ];
  it.each(cases)("%s → %s", (address, region) => {
    expect(regionOf(address, map)).toBe(region);
  });
  it("지역 세부는 둘째 단어다", () => {
    expect(regionDetailOf("전남광주통합특별시 광산구 수완동")).toBe("광산구");
    expect(regionDetailOf("전남")).toBe("");
  });
});

describe("siteNameOf", () => {
  const cases: [string, string][] = [
    ["수완포레외부_1-AAU", "수완포레외부"],
    ["수완포레외부-RRU(F1)", "수완포레외부"],
    ["수완포레외부_2-AAU", "수완포레외부"],
    ["아트박스여수점_1-AAUVL", "아트박스여수점"],
    ["아트박스여수점_DBRRU2(120)", "아트박스여수점"],
    ["아트박스여수점_RRU(F1)", "아트박스여수점"],
    ["아트박스여수점_RRU2(B7_30)", "아트박스여수점"],
    ["여수남면WMC", "여수남면WMC"],
    // 접두 태그
    ["(공동)백운산한재-RRU(F1)", "백운산한재"],
    ["(단독)북구신용동도서관-RRU(F1)", "북구신용동도서관"],
    ["(도서)(공동)비금도L-RRU(F1)", "비금도L"],
    // 인빌딩·기타 꼬리
    ["광양테스트_1-AAUY", "광양테스트"],
    ["광양테스트_1-AAU_이", "광양테스트"],
    ["광양테스트-LORA", "광양테스트"],
    ["광양테스트-GIRS(인S-공K1)_L1P2", "광양테스트"],
    ["광양테스트-GIRO2(인-공K3)_L1P2", "광양테스트"],
    ["광양테스트-PRU(인-공K3)_L1P4", "광양테스트"],
    // 동·층은 지우지 않는다
    ["조촌아너스빌108동B3-GIRO(인-공K3)_L1P2", "조촌아너스빌108동B3"],
    ["웅천부영1차3동옥상-RRU(F1)", "웅천부영1차3동옥상"],
  ];
  it.each(cases)("%s → %s", (name, expected) => {
    expect(siteNameOf(name)).toBe(expected);
  });
});

describe("joinParts", () => {
  it("빈 조각을 빼고 구분자로 잇는다", () => {
    expect(joinParts(["a", "", "b"], "/")).toBe("a/b");
    expect(joinParts(["", ""], "/")).toBe("");
  });
});

describe("applyAliases", () => {
  const aliases = [{ from: "LGT", to: "LGU+" }];
  it("글자가 같으면 바꾸고 앞뒤 공백은 무시한다", () => {
    expect(applyAliases("LGT", aliases)).toBe("LGU+");
    expect(applyAliases(" LGT ", aliases)).toBe("LGU+");
  });
  it("일치가 없으면 그대로다", () => {
    expect(applyAliases("SKT", aliases)).toBe("SKT");
  });
  it("같은 from이 둘이면 먼저 나온 것을 쓴다", () => {
    expect(applyAliases("A", [{ from: "A", to: "1" }, { from: "A", to: "2" }])).toBe("1");
  });
});
