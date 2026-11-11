import { describe, expect, it } from "vitest";
import type { StagedErpRow } from "@/features/map-marker/types/marker";
import {
  groupReviewRows,
  reviewGroupNumbers,
  ungroupReviewRows,
} from "./erp-review-group";

const row = (id: string, address = "전남광주통합특별시 서구 광천동 895번지"): StagedErpRow => ({
  id,
  kind: "new",
  name: id,
  address,
  lat: 35,
  lng: 126,
  marker: { id, name: id },
  info: {},
  erp: {},
});

const find = (rows: StagedErpRow[], id: string) => rows.find((item) => item.id === id)!;

describe("groupReviewRows", () => {
  it("선택한 행을 하나의 그룹으로 묶고 대표 1개, 나머지는 SUB로 한다", () => {
    const rows = groupReviewRows([row("a"), row("b"), row("c"), row("d")], ["a", "b", "c"], "b");

    expect(find(rows, "b").group?.role).toBe("대표");
    expect(find(rows, "a").group?.role).toBe("SUB");
    expect(find(rows, "c").group?.role).toBe("SUB");
    expect(find(rows, "d").group).toBeUndefined();
    const keys = new Set(["a", "b", "c"].map((id) => find(rows, id).group?.key));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toContain("895번지");
  });

  it("마커 행에 group_key·group_role을 실어 저장되게 한다", () => {
    const rows = groupReviewRows([row("a"), row("b")], ["a", "b"], "a");
    expect(find(rows, "a").marker).toMatchObject({
      id: "a",
      group_key: find(rows, "a").group?.key,
      group_role: "대표",
    });
    expect(find(rows, "b").marker).toMatchObject({ group_role: "SUB" });
  });

  it("같은 지번에서 따로 묶은 두 그룹은 서로 다른 키를 가진다", () => {
    let rows = groupReviewRows([row("a"), row("b"), row("c"), row("d")], ["a", "b"], "a");
    rows = groupReviewRows(rows, ["c", "d"], "c");
    expect(find(rows, "a").group?.key).not.toBe(find(rows, "c").group?.key);
  });

  it("공정 마커 ID(erp_코드)처럼 앞부분이 같은 ID여도 묶음 키가 서로 다르고 다른 묶음을 풀지 않는다", () => {
    const ids = ["erp_202634271", "erp_202634273", "erp_202635001", "erp_202635002"];
    let rows = groupReviewRows(ids.map((id) => row(id)), ids.slice(0, 2), ids[0]);
    rows = groupReviewRows(rows, ids.slice(2), ids[2]);
    expect(find(rows, ids[0]).group?.key).not.toBe(find(rows, ids[2]).group?.key);
    expect(find(rows, ids[1]).group?.role).toBe("SUB");
    expect(find(rows, ids[3]).group?.role).toBe("SUB");
  });

  it("대표가 선택에 없거나 선택이 2건 미만이면 바꾸지 않는다", () => {
    const base = [row("a"), row("b")];
    expect(groupReviewRows(base, ["a", "b"], "z")).toEqual(base);
    expect(groupReviewRows(base, ["a"], "a")).toEqual(base);
  });

  it("이미 묶인 행을 다시 묶으면 옛 그룹은 통째로 풀고 새로 묶는다", () => {
    let rows = groupReviewRows([row("a"), row("b"), row("c")], ["a", "b", "c"], "a");
    rows = groupReviewRows(rows, ["b", "c"], "c");
    expect(find(rows, "a").group).toBeUndefined();
    expect(find(rows, "a").marker).not.toHaveProperty("group_key");
    expect(find(rows, "c").group?.role).toBe("대표");
    expect(find(rows, "b").group?.role).toBe("SUB");
  });
});

describe("ungroupReviewRows", () => {
  it("선택한 행이 속한 그룹 전체를 풀고 마커 행에서 그룹 값을 지운다", () => {
    let rows = groupReviewRows([row("a"), row("b"), row("c")], ["a", "b"], "a");
    rows = ungroupReviewRows(rows, ["b"]);
    expect(find(rows, "a").group).toBeUndefined();
    expect(find(rows, "b").group).toBeUndefined();
    expect(find(rows, "a").marker).toEqual({ id: "a", name: "a" });
  });
});

describe("reviewGroupNumbers", () => {
  it("그룹 키마다 목록 행 순서대로 1부터 번호를 매긴다", () => {
    let rows = groupReviewRows([row("a"), row("b"), row("c"), row("d")], ["c", "d"], "c");
    rows = groupReviewRows(rows, ["a", "b"], "a");
    const numbers = reviewGroupNumbers(rows);
    expect(numbers.get(find(rows, "a").group!.key)).toBe(1);
    expect(numbers.get(find(rows, "c").group!.key)).toBe(2);
  });
});
