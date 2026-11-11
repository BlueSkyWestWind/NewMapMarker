import { describe, expect, it } from "vitest";
import type { StagedErpRow } from "@/features/map-marker/types/marker";
import type { ExistingMarkerRef } from "./erp-classify";
import { previewAddonRow, previewExistingRow } from "./erp-preview";

const info = (over: Record<string, unknown> = {}) => ({
  marker_id: "m1",
  place_name: "국소",
  facility_code: "C1",
  project_code: "P-NEW",
  facility_year: "2026",
  business_type: "신설",
  final_station_name: "국소",
  eq_class: "GIRO",
  eq_type: "RO-A",
  install_date: "2026-04-14",
  open_date: "2026-04-23",
  ...over,
});

const row = (kind: StagedErpRow["kind"], over: Record<string, unknown> = {}, name = "국소"): StagedErpRow => ({
  id: "m1",
  kind,
  name,
  address: "주소",
  lat: 35,
  lng: 126,
  marker: { id: "m1", name },
  info: info(over),
  erp: { marker_id: "m1" },
});

const marker = (infoRows: ReturnType<typeof info>[], name = "국소"): ExistingMarkerRef => ({
  id: "m1",
  name,
  facility_code: "C1",
  lat: 35,
  lng: 126,
  info_rows: infoRows,
});

describe("previewExistingRow — 기존 건 갱신", () => {
  it("바뀌는 칸만 이전 → 이후로 보여 준다", () => {
    const preview = previewExistingRow(
      row("existing", { install_date: "2026-05-01", eq_type: "RO-B" }),
      marker([info()]),
    );
    expect(preview.changes).toEqual([
      { label: "장비타입", before: "RO-A", after: "RO-B" },
      { label: "시설일", before: "2026-04-14", after: "2026-05-01" },
    ]);
    expect(preview.kind).toBe("update");
  });

  it("값이 같으면 변경 없음이다", () => {
    expect(previewExistingRow(row("existing"), marker([info()])).changes).toEqual([]);
  });

  it("국소명이 다르면 국소명 변경으로 보여 준다", () => {
    const preview = previewExistingRow(row("existing", {}, "새 이름"), marker([info()], "옛 이름"));
    expect(preview.changes[0]).toEqual({ label: "국소명", before: "옛 이름", after: "새 이름" });
  });

  it("빈 값과 null·공백은 같은 것으로 본다", () => {
    const preview = previewExistingRow(
      row("existing", { open_date: "", eq_class: " " }),
      marker([info({ open_date: null, eq_class: "" })]),
    );
    expect(preview.changes).toEqual([]);
  });

  it("같은 프로젝트코드의 DB 행과 비교하고 다른 프로젝트 행은 무시한다", () => {
    const preview = previewExistingRow(
      row("existing", { project_code: "P-EXT", business_type: "부대장비증설" }),
      marker([info(), info({ project_code: "P-EXT", business_type: "부대장비증설" })]),
    );
    expect(preview.changes).toEqual([]);
  });

  it("같은 프로젝트의 DB 행이 없으면 새 상세 행으로 보여 준다", () => {
    const preview = previewExistingRow(row("existing", { project_code: "P-X" }), marker([info()]));
    expect(preview.changes).toEqual([{ label: "상세 행", before: "없음", after: "새로 추가 (P-X)" }]);
  });
});

describe("previewAddonRow — 추가 사업 반영", () => {
  it("새로 들어갈 값을 모두 보여 준다(빈 값 제외)", () => {
    const preview = previewAddonRow(row("addon", { project_code: "P-EXT", business_type: "부대장비증설" }));
    expect(preview.kind).toBe("add");
    expect(preview.changes.map((c) => c.label)).toContain("프로젝트코드");
    expect(preview.changes.find((c) => c.label === "사업구분")).toEqual({
      label: "사업구분",
      before: "",
      after: "부대장비증설",
    });
  });

  it("시설일이 비면 시설 상태가 미시설로 바뀐다는 경고를 붙인다", () => {
    const preview = previewAddonRow(row("addon", { install_date: "", open_date: "" }));
    expect(preview.warning).toContain("미시설");
  });

  it("시설일은 있고 개통일만 비면 시설 상태 경고를 붙인다", () => {
    const preview = previewAddonRow(row("addon", { install_date: "2026-05-01", open_date: "" }));
    expect(preview.warning).toContain("시설");
    expect(preview.warning).not.toContain("미시설");
  });

  it("날짜가 모두 있으면 경고가 없다", () => {
    expect(previewAddonRow(row("addon")).warning).toBe("");
  });
});
