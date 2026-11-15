import { describe, expect, it } from "vitest";
import {
  collectFieldNames,
  hasRoadSectionField,
  normalizeCctvRow,
} from "./its-client";

describe("normalizeCctvRow", () => {
  it("필수 필드가 있는 행을 CctvItem 형태로 정규화한다", () => {
    // 출처: types/cctv.ts의 CctvItem 필드 정의 및 its-client.ts 주석(좌표+명칭 id, 대소문자/언더스코어 무관)
    const item = normalizeCctvRow(
      {
        cctvName: "호남고속도로 상행1",
        coordY: "35.123456",
        coordX: "126.987654",
        road_section_id: "RS-100",
        cctvUrl: "https://example.com/stream.m3u8",
      },
      "ex",
    );

    expect(item).toEqual({
      id: "ex:126.987654,35.123456:호남고속도로 상행1",
      name: "호남고속도로 상행1",
      lat: 35.123456,
      lng: 126.987654,
      roadType: "ex",
      roadSectionId: "RS-100",
      direction: "상행",
      directionTarget: null,
      streamUrl: "https://example.com/stream.m3u8",
    });
  });

  it("좌표가 없거나 숫자가 아니면 null을 반환한다", () => {
    // 출처: its-client.ts 주석 ("좌표가 없으면 지도에 올릴 수 없고 링크 매칭도 불가능하다 → 버린다")
    expect(normalizeCctvRow({ cctvname: "A" }, "its")).toBeNull();
    expect(
      normalizeCctvRow({ cctvname: "A", coordy: "abc", coordx: "127.0" }, "its"),
    ).toBeNull();
  });
});

describe("hasRoadSectionField", () => {
  it("행 집합에 roadsectionid(언더스코어·대소문자 무관) 필드가 있으면 true, 없으면 false다", () => {
    // 출처: its-client.ts 주석 ("응답에 roadsectionid 필드가 존재하는지 (값 유무와 별개)")
    expect(hasRoadSectionField([{ cctvname: "A", road_section_id: "" }])).toBe(true);
    expect(hasRoadSectionField([{ cctvname: "A", coordx: 127 }])).toBe(false);
  });
});

describe("collectFieldNames", () => {
  it("여러 행의 필드 이름을 중복 없이 정렬해 모은다", () => {
    // 출처: its-client.ts collectFieldNames ("응답 1건의 실제 필드명 목록")
    expect(
      collectFieldNames([
        { coordy: 35, cctvname: "A" },
        { cctvname: "B", coordx: 127 },
      ]),
    ).toEqual(["cctvname", "coordx", "coordy"]);
  });
});
