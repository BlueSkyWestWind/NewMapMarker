import { describe, expect, it } from "vitest";
import type { ErpParsedRow } from "@/features/map-marker/lib/excel/data-manager/erp-parse";
import type { StagedErpRow, StagedErpUpload } from "@/features/map-marker/types/marker";
import {
  buildStagedErpRow,
  classifyErpRows,
  findMissingErpDateColumns,
} from "./erp-classify";
import {
  isStagedReviewMarker,
  parseErpDraft,
  serializeErpDraft,
  withPreviousCoords,
} from "./erp-review";

const parsed = (facilityCode: string, extra: Partial<ErpParsedRow> = {}): ErpParsedRow => ({
  facilityCode,
  name: `국소${facilityCode}`,
  address: "광주 북구 운암동 1",
  projectCode: "",
  facilityYear: "2026",
  businessType: "",
  eqClass: "",
  eqType: "",
  installDate: "",
  openDate: "",
  finalStationName: "",
  erp: {},
  raw: {},
  ...extra,
});

const stored = (
  id: string,
  facility_code: string | null,
  lat: unknown = 35,
  lng: unknown = 126,
) => ({ id, facility_code, lat, lng });

const reviewRow = (
  id: string,
  lat: number | null = 35,
  lng: number | null = 126,
): StagedErpRow => ({
  id,
  kind: "new",
  name: id,
  address: "광주 북구 운암동 1",
  lat,
  lng,
  marker: { id },
  info: { marker_id: id },
  erp: { marker_id: id },
});

const upload = (over: Partial<StagedErpUpload> = {}): StagedErpUpload => ({
  reviewRows: [],
  existingRows: [],
  skippedRows: [],
  needsRegroup: false,
  geocodeFailedAddresses: [],
  ...over,
});

describe("classifyErpRows", () => {
  it("DB에 없는 코드는 신규다", () => {
    const { classified } = classifyErpRows([parsed("A")], []);
    expect(classified).toMatchObject([{ id: "erp_A", kind: "new", lat: null, lng: null }]);
  });

  it("좌표가 있는 기존 건은 기존 ID와 좌표를 쓴다", () => {
    const { classified } = classifyErpRows([parsed("A")], [stored("old_1", "A")]);
    expect(classified).toMatchObject([{ id: "old_1", kind: "existing", lat: 35, lng: 126 }]);
  });

  it("좌표가 없는 기존 건은 좌표 확인 대상이다", () => {
    const { classified } = classifyErpRows([parsed("A")], [stored("erp_A", "A", null, null)]);
    expect(classified).toMatchObject([{ id: "erp_A", kind: "missingCoords" }]);
  });

  it("코드가 비어 있어도 ID가 erp_코드인 마커와 연결한다", () => {
    const { classified } = classifyErpRows([parsed("A")], [stored("erp_A", null)]);
    expect(classified).toMatchObject([{ id: "erp_A", kind: "existing" }]);
  });

  it("코드 없는 행은 분류에서 빼고 따로 돌려준다", () => {
    const { classified, skippedRows } = classifyErpRows(
      [parsed("", { name: "무코드", address: "주소" })],
      [],
    );
    expect(classified).toEqual([]);
    expect(skippedRows).toEqual([
      { name: "무코드", address: "주소", reason: "코드 없음" },
    ]);
  });

  it.each(["", "불필요", " 불필요 ", "미확정"])(
    "주소가 '%s'인 행은 마커로 등록하지 않는다",
    (address) => {
      const { classified, skippedRows } = classifyErpRows(
        [parsed("2026Y5479", { name: "임시_LTE_예비품전환_서부", address })],
        [],
      );
      expect(classified).toEqual([]);
      expect(skippedRows).toEqual([
        { name: "임시_LTE_예비품전환_서부", address, reason: "주소 없음" },
      ]);
    },
  );

  it("이미 등록된 코드라도 주소가 없으면 갱신 대상에서 뺀다", () => {
    const { classified, skippedRows } = classifyErpRows(
      [parsed("A", { address: "불필요" })],
      [stored("erp_A", "A")],
    );
    expect(classified).toEqual([]);
    expect(skippedRows).toHaveLength(1);
  });

  it("같은 코드가 여러 행이면 DB의 마커에 순서대로 연결하고 남는 행은 신규다", () => {
    const { classified } = classifyErpRows(
      [parsed("A"), parsed("A"), parsed("A")],
      [stored("erp_A", "A"), stored("erp_A_1", "A")],
    );
    expect(classified.map((c) => [c.id, c.kind])).toEqual([
      ["erp_A", "existing"],
      ["erp_A_1", "existing"],
      ["erp_A_2", "new"],
    ]);
  });
});

describe("buildStagedErpRow", () => {
  const row = (kind: "new" | "missingCoords" | "existing", id = "erp_A") =>
    buildStagedErpRow(
      {
        row: parsed("A", { erp: { facility_code: "A" }, raw: { x: "1" } }),
        id,
        kind,
        lat: null,
        lng: null,
      },
      kind === "existing" ? null : { lat: 35.1, lng: 126.9 },
    );

  it("신규는 기본값을 포함한 전체 마커 행을 만든다", () => {
    expect(row("new").marker).toMatchObject({
      id: "erp_A",
      name: "국소A",
      memo: "",
      tags: [],
      facility_team: "",
      facility_code: "A",
      jibun_address: "광주 북구 운암동 1",
    });
    expect(row("new")).toMatchObject({ lat: 35.1, lng: 126.9 });
  });

  it("기존 건 마커 행에는 국소명과 코드만 담아 다른 값을 덮어쓰지 않는다", () => {
    expect(row("existing").marker).toEqual({
      id: "erp_A",
      name: "국소A",
      facility_code: "A",
    });
  });

  it("좌표 없는 기존 건도 메모·색상·주소를 담지 않는다", () => {
    expect(Object.keys(row("missingCoords").marker).sort()).toEqual([
      "facility_code",
      "id",
      "name",
    ]);
  });

  it("공정 정보 행은 마커 ID로 연결한다", () => {
    const built = row("existing", "old_1");
    expect(built.info).toMatchObject({
      marker_id: "old_1",
      place_name: "국소A",
      facility_code: "A",
    });
    expect(built.erp).toMatchObject({
      marker_id: "old_1",
      facility_code: "A",
      raw: { x: "1" },
    });
  });
});

describe("findMissingErpDateColumns", () => {
  it("시설일·개통일 열이 모두 있으면 빈 배열이다", () => {
    expect(
      findMissingErpDateColumns([
        parsed("A", { raw: { "장비 공사": null, "시험 완료": null } }),
      ]),
    ).toEqual([]);
  });

  it("없는 열을 알려 준다", () => {
    expect(findMissingErpDateColumns([parsed("A", { raw: { "장비 공사": "1" } })])).toEqual([
      "개통일",
    ]);
    expect(findMissingErpDateColumns([parsed("A", { raw: {} })])).toEqual([
      "시설일",
      "개통일",
    ]);
  });
});

describe("withPreviousCoords", () => {
  it("같은 ID는 이전에 옮긴 위치를 유지하고 없는 ID는 그대로 둔다", () => {
    const result = withPreviousCoords(
      [reviewRow("a", 1, 1), reviewRow("b", 2, 2)],
      new Map([["a", { lat: 9, lng: 9 }]]),
    );
    expect(result.map((r) => [r.lat, r.lng])).toEqual([
      [9, 9],
      [2, 2],
    ]);
  });
});

describe("isStagedReviewMarker", () => {
  it("확인 목록의 마커만 참이다", () => {
    const staged = upload({ reviewRows: [reviewRow("a")] });
    expect(isStagedReviewMarker(staged, "a")).toBe(true);
    expect(isStagedReviewMarker(staged, "b")).toBe(false);
    expect(isStagedReviewMarker(null, "a")).toBe(false);
  });
});

describe("임시 저장", () => {
  it("옮긴 위치를 반영해 저장하고 그대로 복원한다", () => {
    const text = serializeErpDraft(
      upload({ reviewRows: [reviewRow("a", 1, 1)], needsRegroup: true }),
      [{ id: "a", lat: 7, lng: 8 }],
    );
    const restored = parseErpDraft(text!);
    expect(restored?.reviewRows[0]).toMatchObject({ id: "a", lat: 7, lng: 8 });
    expect(restored?.needsRegroup).toBe(true);
  });

  it("기존 건은 임시 저장에 넣지 않는다", () => {
    const text = serializeErpDraft(
      upload({ reviewRows: [reviewRow("a")], existingRows: [reviewRow("b")] }),
      [],
    );
    expect(parseErpDraft(text!)?.existingRows).toEqual([]);
  });

  it("남은 작업이 없으면 저장할 내용이 없다", () => {
    expect(serializeErpDraft(null, [])).toBeNull();
    expect(serializeErpDraft(upload({ existingRows: [reviewRow("b")] }), [])).toBeNull();
  });

  it("재정리만 남아도 저장한다", () => {
    expect(serializeErpDraft(upload({ needsRegroup: true }), [])).not.toBeNull();
  });

  it("손상되거나 형식이 다른 내용은 버린다", () => {
    expect(parseErpDraft("{깨짐")).toBeNull();
    expect(parseErpDraft(JSON.stringify({ version: 999, reviewRows: [] }))).toBeNull();
    expect(parseErpDraft(JSON.stringify({ version: 1 }))).toBeNull();
  });
});
