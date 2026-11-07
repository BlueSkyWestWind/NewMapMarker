import { describe, expect, it } from "vitest";
import type { SupabaseBrowserClient } from "@/lib/supabase/client";
import {
  addOption,
  deleteArchiveRows,
  deleteOption,
  fetchArchive,
  fetchDayDetails,
  fetchErpRefs,
  fetchLatestArchive,
  fetchOptionLists,
  saveArchiveRows,
  upsertDayDetails,
} from "./day-api";
import { DAY_COLUMN_KEYS, type ArchiveRow, type DayDetail, type DayValues } from "./lib/day-types";
import { OPTION_LIST_SEEDS } from "./lib/option-lists";

interface Result {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number | null;
}

/** 한 번의 `from(table)...` 호출: 테이블과 이어 붙인 메서드(이름, 인자) 순서. */
interface Call {
  table: string;
  steps: [string, unknown[]][];
}

/**
 * 체인 메서드를 모두 받아 적고, `await`하면 `respond`의 결과를 돌려주는 가짜 클라이언트.
 * `calls` 순서가 곧 호출 순서다.
 */
function stubClient(respond: (call: Call) => Result = () => ({ data: [], error: null })) {
  const calls: Call[] = [];
  const client = {
    from: (table: string) => {
      const call: Call = { table, steps: [] };
      calls.push(call);
      const builder: unknown = new Proxy(
        {},
        {
          get: (_target, prop) => {
            if (prop === "then") {
              return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
                Promise.resolve(respond(call)).then(
                  (result) => resolve({ data: null, error: null, count: null, ...result }),
                  reject,
                );
            }
            return (...args: unknown[]) => {
              call.steps.push([String(prop), args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  } as unknown as SupabaseBrowserClient;
  return { client, calls };
}

function stepArgs(call: Call, name: string): unknown[] | undefined {
  return call.steps.find(([step]) => step === name)?.[1];
}

function stepNames(call: Call): string[] {
  return call.steps.map(([step]) => step);
}

function blankValues(overrides: Partial<DayValues> = {}): DayValues {
  const values = Object.fromEntries(DAY_COLUMN_KEYS.map((key) => [key, ""])) as DayValues;
  return { ...values, ...overrides };
}

function archiveRow(workDate: string, stationKey: string, site: string): ArchiveRow {
  return {
    workDate,
    stationKey,
    site,
    values: blankValues({ site, workDate, project: "P1", facilityCode: "F-1" }),
    savedAt: "2026-11-07T01:00:00.000Z",
  };
}

function erpRow(id: number | string, stationFinal: string, project: string) {
  return {
    id,
    station_final: stationFinal,
    facility_code: null,
    project,
    method: "기지국",
    biz_category: null,
    region_sigungu: null,
    equip_final: null,
    realty_type: null,
    equip_location: null,
    address_full: null,
    raw: null,
  };
}

describe("fetchErpRefs", () => {
  it("같은 station_final이 두 행이면 id가 큰 행을 쓰고, 키는 stationKey(station_final)이다", async () => {
    const { client, calls } = stubClient(() => ({
      data: [erpRow(5, "여수 봉산", "예전"), erpRow(9, "여수 봉산", "최근"), erpRow(2, "Other", "다른")],
      count: 3,
    }));
    const refs = await fetchErpRefs(client, ["여수 봉산", "Other"]);
    expect([...refs.keys()].sort()).toEqual(["other", "여수봉산"]);
    expect(refs.get("여수봉산")?.project).toBe("최근");
    expect(refs.get("other")?.project).toBe("다른");
    expect(calls[0].table).toBe("erp_details");
  });

  it("id는 숫자로 비교한다(9보다 10이 크다). 행 순서와 id 형식(문자열)에 흔들리지 않는다", async () => {
    const { client } = stubClient(() => ({
      data: [erpRow("10", "A", "열번째"), erpRow("9", "A", "아홉번째")],
      count: 2,
    }));
    expect((await fetchErpRefs(client, ["A"])).get("a")?.project).toBe("열번째");

    const reversed = stubClient(() => ({
      data: [erpRow("9", "A", "아홉번째"), erpRow("10", "A", "열번째")],
      count: 2,
    }));
    expect((await fetchErpRefs(reversed.client, ["A"])).get("a")?.project).toBe("열번째");
  });

  it("in 조건에 넘기는 이름은 앞뒤 공백을 지우고 중복·빈 값을 뺀다", async () => {
    const { client, calls } = stubClient(() => ({ data: [], count: 0 }));
    await fetchErpRefs(client, ["A 국소", " A 국소 ", "B", "", "  "]);
    expect(stepArgs(calls[0], "in")).toEqual(["station_final", ["A 국소", "B"]]);
  });

  it("조회할 국소가 없으면 DB를 부르지 않는다", async () => {
    const { client, calls } = stubClient();
    expect((await fetchErpRefs(client, ["", " "])).size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("오류는 그대로 던진다", async () => {
    const { client } = stubClient(() => ({ error: { message: "권한 없음" } }));
    await expect(fetchErpRefs(client, ["A"])).rejects.toMatchObject({ message: "권한 없음" });
  });
});

describe("fetchDayDetails / upsertDayDetails", () => {
  it("DB 행을 DayDetail로 바꾼다: null은 null, 빈 글은 빈 글로 두고 overrides는 참조 열의 글만 남긴다", async () => {
    const { client, calls } = stubClient(() => ({
      data: [
        {
          work_date: "2026-11-09",
          station_key: "a국소",
          site: "A 국소",
          work_category: null,
          level_label: "",
          work_time: "야간",
          work_type: null,
          equipment: null,
          work_content: null,
          work_detail: "상세",
          worker: "",
          witness: null,
          signaler: null,
          overrides: { project: "덮어씀", address: 3, unknown: "x", region: "" },
        },
        { work_date: "2026-11-09", station_key: "b", site: "B", overrides: null },
      ],
    }));
    const details = await fetchDayDetails(client, "2026-11-09");
    expect(calls[0].table).toBe("schedule_day_details");
    expect(stepArgs(calls[0], "eq")).toEqual(["work_date", "2026-11-09"]);
    expect(details[0]).toEqual({
      workDate: "2026-11-09",
      stationKey: "a국소",
      site: "A 국소",
      workCategory: null,
      levelLabel: "",
      workTime: "야간",
      workType: null,
      equipment: null,
      workContent: null,
      workDetail: "상세",
      worker: "",
      witness: null,
      signaler: null,
      overrides: { project: "덮어씀", region: "" },
    });
    expect(details[1].workTime).toBeNull();
    expect(details[1].overrides).toEqual({});
  });

  it("upsert는 (work_date, station_key) 충돌로 보내고 빈 글은 그대로, 빠진 값만 null로 둔다", async () => {
    const { client, calls } = stubClient();
    const detail = {
      workDate: "2026-11-09",
      stationKey: "a국소",
      site: "A 국소",
      workCategory: "",
      workTime: "야간",
      overrides: { project: "P" },
    } as unknown as DayDetail;
    await upsertDayDetails(client, [detail]);
    expect(calls[0].table).toBe("schedule_day_details");
    const [rows, options] = stepArgs(calls[0], "upsert") as [Record<string, unknown>[], { onConflict: string }];
    expect(options).toEqual({ onConflict: "work_date,station_key" });
    expect(rows[0]).toMatchObject({
      work_date: "2026-11-09",
      station_key: "a국소",
      site: "A 국소",
      work_category: "",
      level_label: null,
      work_time: "야간",
      work_type: null,
      work_detail: null,
      worker: null,
      overrides: { project: "P" },
    });
  });

  it("보낼 상세가 없으면 DB를 부르지 않는다", async () => {
    const { client, calls } = stubClient();
    await upsertDayDetails(client, []);
    expect(calls).toHaveLength(0);
  });
});

describe("fetchOptionLists", () => {
  it("표가 비면 처음 값(OPTION_LIST_SEEDS)을 돌려준다", async () => {
    const { client } = stubClient(() => ({ data: [] }));
    expect(await fetchOptionLists(client)).toEqual(OPTION_LIST_SEEDS);
  });

  it("sort_order 순으로 정렬해 목록 이름별로 모으고, 없는 목록은 빈 배열이다", async () => {
    const { client, calls } = stubClient(() => ({
      data: [
        { list_key: "workTime", value: "야간", sort_order: 1 },
        { list_key: "workTime", value: "주간", sort_order: 0 },
        { list_key: "equipment", value: "굴착기", sort_order: 3 },
        { list_key: "equipment", value: "롤러", sort_order: 2 },
        { list_key: "모르는목록", value: "무시", sort_order: 0 },
      ],
    }));
    const lists = await fetchOptionLists(client);
    expect(calls[0].table).toBe("schedule_option_lists");
    expect(lists.workTime).toEqual(["주간", "야간"]);
    expect(lists.equipment).toEqual(["롤러", "굴착기"]);
    expect(lists.bizClass).toEqual([]);
  });

  it("복사본을 돌려줘 처음 값을 바꿔도 상수가 오염되지 않는다", async () => {
    const { client } = stubClient(() => ({ data: [] }));
    const lists = await fetchOptionLists(client);
    lists.workTime.push("추가");
    expect(OPTION_LIST_SEEDS.workTime).not.toContain("추가");
  });
});

describe("addOption / deleteOption", () => {
  it("값을 다듬어 그 목록의 끝 순서로 넣는다(이미 있으면 무시)", async () => {
    const { client, calls } = stubClient((call) =>
      stepNames(call).includes("upsert") ? { data: null } : { data: [{ sort_order: 16 }] },
    );
    await addOption(client, "equipment", "  이동식크레인  ");
    expect(stepArgs(calls[0], "eq")).toEqual(["list_key", "equipment"]);
    const [row, options] = stepArgs(calls[1], "upsert") as [Record<string, unknown>, Record<string, unknown>];
    expect(row).toEqual({ list_key: "equipment", value: "이동식크레인", sort_order: 17 });
    expect(options).toEqual({ onConflict: "list_key,value", ignoreDuplicates: true });
  });

  it("목록이 비어 있으면 순서 0으로 시작한다", async () => {
    const { client, calls } = stubClient(() => ({ data: [] }));
    await addOption(client, "workTime", "새벽");
    expect((stepArgs(calls[1], "upsert") as [Record<string, unknown>])[0]).toMatchObject({ sort_order: 0 });
  });

  it("공백뿐인 값과 100자를 넘는 값은 DB를 부르지 않고 거절한다", async () => {
    const { client, calls } = stubClient();
    await expect(addOption(client, "workTime", "   ")).rejects.toThrow();
    await expect(addOption(client, "workTime", "가".repeat(101))).rejects.toThrow();
    await expect(deleteOption(client, "workTime", "  ")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("삭제도 값을 다듬어 목록 이름·값으로 지운다", async () => {
    const { client, calls } = stubClient();
    await deleteOption(client, "workTime", " 야간 ");
    expect(calls[0].table).toBe("schedule_option_lists");
    expect(stepNames(calls[0])[0]).toBe("delete");
    expect(calls[0].steps.filter(([name]) => name === "eq").map(([, args]) => args)).toEqual([
      ["list_key", "workTime"],
      ["value", "야간"],
    ]);
  });
});

describe("saveArchiveRows", () => {
  it("upsert한 뒤, 넘긴 키 밖의 그날 예전 행을 not in으로 지운다(호출 순서: upsert → delete)", async () => {
    const { client, calls } = stubClient();
    await saveArchiveRows(client, "2026-11-09", [
      archiveRow("2026-11-09", "a국소", "A 국소"),
      archiveRow("2026-11-09", "b국소", "B 국소"),
    ]);
    expect(calls.map((call) => [call.table, stepNames(call)[0]])).toEqual([
      ["schedule_archive_rows", "upsert"],
      ["schedule_archive_rows", "delete"],
    ]);

    const [rows, options] = stepArgs(calls[0], "upsert") as [Record<string, unknown>[], { onConflict: string }];
    expect(options).toEqual({ onConflict: "work_date,station_key" });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      work_date: "2026-11-09",
      station_key: "a국소",
      site: "A 국소",
      search_text: "a 국소 p1 f-1",
    });
    // 저장 시각·저장자는 클라이언트 시계가 아니라 DB(기본값 + BEFORE UPDATE 트리거)가 채운다.
    expect(rows[0]).not.toHaveProperty("saved_at");
    expect(rows[0]).not.toHaveProperty("saved_by");
    expect((rows[0].row_values as DayValues).project).toBe("P1");

    expect(stepArgs(calls[1], "eq")).toEqual(["work_date", "2026-11-09"]);
    expect(stepArgs(calls[1], "not")).toEqual(["station_key", "in", '("a국소","b국소")']);
  });

  it("쉼표·괄호·따옴표가 든 키도 목록을 깨지 않게 따옴표로 감싸 이스케이프한다", async () => {
    const { client, calls } = stubClient();
    await saveArchiveRows(client, "2026-11-09", [archiveRow("2026-11-09", 'a,b)"c', "A,B)\"C")]);
    expect(stepArgs(calls[1], "not")).toEqual(["station_key", "in", '("a,b)\\"c")']);
  });

  it("upsert가 실패하면 삭제로 넘어가지 않는다", async () => {
    const { client, calls } = stubClient(() => ({ error: { message: "제약 위반" } }));
    await expect(saveArchiveRows(client, "2026-11-09", [archiveRow("2026-11-09", "a", "A")])).rejects.toMatchObject({
      message: "제약 위반",
    });
    expect(calls).toHaveLength(1);
  });

  it("저장할 행이 없으면 아무것도 하지 않는다(일정이 비었다고 그날 누적을 지우지 않는다)", async () => {
    const { client, calls } = stubClient();
    await saveArchiveRows(client, "2026-11-09", []);
    expect(calls).toHaveLength(0);
  });
});

describe("fetchArchive", () => {
  it("작업일 내림차순, 기간과 검색어(search_text likePattern)로 거르고 건수를 제한한다", async () => {
    const { client, calls } = stubClient(() => ({
      data: [
        {
          work_date: "2026-11-09",
          station_key: "a",
          site: "A",
          row_values: { site: "A", project: 5, workDate: "2026-11-09" },
          saved_at: "2026-11-07T01:00:00+00:00",
        },
      ],
    }));
    const rows = await fetchArchive(client, { from: "2026-11-01", to: "2026-11-30", text: " B7_30 " }, 50);
    const call = calls[0];
    expect(call.table).toBe("schedule_archive_rows");
    expect(call.steps.find(([name]) => name === "order")?.[1]).toEqual(["work_date", { ascending: false }]);
    expect(stepArgs(call, "gte")).toEqual(["work_date", "2026-11-01"]);
    expect(stepArgs(call, "lte")).toEqual(["work_date", "2026-11-30"]);
    expect(stepArgs(call, "ilike")).toEqual(["search_text", "%B7\\_30%"]);
    expect(stepArgs(call, "limit")).toEqual([50]);

    expect(rows[0].workDate).toBe("2026-11-09");
    expect(rows[0].savedAt).toBe("2026-11-07T01:00:00+00:00");
    // 24열이 모두 있고, 글이 아닌 값은 빈 글이다.
    expect(Object.keys(rows[0].values)).toEqual([...DAY_COLUMN_KEYS]);
    expect(rows[0].values.site).toBe("A");
    expect(rows[0].values.project).toBe("");
  });

  it("조건이 없으면 거르지 않고, 공백뿐인 검색어는 무시한다", async () => {
    const { client, calls } = stubClient();
    await fetchArchive(client, { text: "   " });
    expect(stepNames(calls[0])).not.toContain("gte");
    expect(stepNames(calls[0])).not.toContain("lte");
    expect(stepNames(calls[0])).not.toContain("ilike");
    expect(stepArgs(calls[0], "limit")).toEqual([500]);
  });
});

describe("fetchLatestArchive / deleteArchiveRows", () => {
  it("국소 키를 중복 없이 in으로 묻고 국소마다 가장 최근 행만 남긴다", async () => {
    const row = (workDate: string, stationKey: string) => ({
      work_date: workDate,
      station_key: stationKey,
      site: stationKey,
      row_values: {},
      saved_at: "2026-11-07T01:00:00Z",
    });
    const { client, calls } = stubClient(() => ({
      data: [row("2026-11-05", "a"), row("2026-11-01", "a"), row("2026-10-01", "b")],
      count: 3,
    }));
    const latest = await fetchLatestArchive(client, ["a", "b", "a"]);
    expect(stepArgs(calls[0], "in")).toEqual(["station_key", ["a", "b"]]);
    expect(latest.get("a")?.workDate).toBe("2026-11-05");
    expect(latest.get("b")?.workDate).toBe("2026-10-01");
  });

  it("beforeDate를 주면 그 날짜보다 앞선 행만 묻고, 주지 않으면 날짜로 거르지 않는다", async () => {
    const bounded = stubClient(() => ({ data: [], count: 0 }));
    await fetchLatestArchive(bounded.client, ["a"], "2026-11-09");
    expect(stepArgs(bounded.calls[0], "lt")).toEqual(["work_date", "2026-11-09"]);

    const unbounded = stubClient(() => ({ data: [], count: 0 }));
    await fetchLatestArchive(unbounded.client, ["a"]);
    expect(stepNames(unbounded.calls[0])).not.toContain("lt");
  });

  it("국소 키가 없으면 DB를 부르지 않는다", async () => {
    const { client, calls } = stubClient();
    expect((await fetchLatestArchive(client, [])).size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("행 삭제는 작업일별로 묶어 한 번씩 지운다", async () => {
    const { client, calls } = stubClient();
    await deleteArchiveRows(client, [
      { workDate: "2026-11-09", stationKey: "a" },
      { workDate: "2026-11-09", stationKey: "b" },
      { workDate: "2026-11-10", stationKey: "a" },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[0].steps.map(([name, args]) => [name, args])).toEqual([
      ["delete", []],
      ["eq", ["work_date", "2026-11-09"]],
      ["in", ["station_key", ["a", "b"]]],
    ]);
    expect(stepArgs(calls[1], "in")).toEqual(["station_key", ["a"]]);
  });

  it("지울 행이 없으면 DB를 부르지 않는다", async () => {
    const { client, calls } = stubClient();
    await deleteArchiveRows(client, []);
    expect(calls).toHaveLength(0);
  });
});
