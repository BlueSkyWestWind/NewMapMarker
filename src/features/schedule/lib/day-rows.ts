import { buildDayStations, type DayStation } from "@/features/schedule/lib/day-stations";
import { mergeRefTiers } from "@/features/schedule/lib/day-reference";
import {
  DAY_COLUMN_KEYS,
  DAY_DEFAULTS,
  REF_KEYS,
  type DayDetail,
  type DayValues,
  type RefSource,
  type RefValues,
} from "@/features/schedule/lib/day-types";
import { addDays, todayIso } from "@/features/schedule/lib/week";
import type { ScheduleCell, ScheduleColumn } from "@/features/schedule/types";

/** 일자별 표의 한 행: 국소 하나의 24열 값. */
export interface DayRow {
  stationKey: string;
  site: string;
  values: DayValues;
  /** 참조 열 값을 가져온 층. 어느 층에도 없으면 `null`. */
  refSource: RefSource | null;
  /** 일정이 아니라 표에서 직접 추가한 행 */
  isManual?: boolean;
}

export interface BuildDayRowsInput {
  workDate: string;
  columns: ScheduleColumn[];
  cells: ScheduleCell[];
  /** 키는 `stationKey` */
  details: ReadonlyMap<string, DayDetail>;
  /** 층별 참조 값(키는 `stationKey`) */
  refs: {
    erp: ReadonlyMap<string, RefValues>;
    archive: ReadonlyMap<string, RefValues>;
    marker: ReadonlyMap<string, RefValues>;
  };
}

function emptyValues(): DayValues {
  return Object.fromEntries(DAY_COLUMN_KEYS.map((key) => [key, ""])) as DayValues;
}

/**
 * 그날 표에 직접 추가한 국소(상세 행의 `isManual`). 일정에 이미 있는 국소는 제외한다(일정 행이 우선).
 * 작업일 필터는 DB 조회(`fetchDayDetails`)가 이미 한다.
 */
export function manualStationsOf(
  details: Iterable<DayDetail>,
  scheduled: readonly { key: string }[],
): DayStation[] {
  const taken = new Set(scheduled.map((station) => station.key));
  return [...details]
    .filter((detail) => detail.isManual === true && !taken.has(detail.stationKey))
    .sort((a, b) => a.site.localeCompare(b.site, "ko"))
    .map((detail) => ({ key: detail.stationKey, site: detail.site, leaders: [], witnesses: [], signalers: [] }));
}

/**
 * 일정의 국소마다 한 행을 만들고, 직접 추가한 행을 뒤에 붙인다.
 * 참조(공정관리 → 누적 → 마커) → 덮어쓰기 → 상세·기본값 순으로 채운다.
 */
export function buildDayRows(input: BuildDayRowsInput): DayRow[] {
  const scheduled = buildDayStations({ workDate: input.workDate, columns: input.columns, cells: input.cells });
  const stations = [...scheduled, ...manualStationsOf(input.details.values(), scheduled)];
  const manualKeys = new Set(stations.slice(scheduled.length).map((station) => station.key));

  return stations.map((station, index) => {
    const detail = input.details.get(station.key);
    const { values: ref, source } = mergeRefTiers({
      erp: input.refs.erp.get(station.key),
      archive: input.refs.archive.get(station.key),
      marker: input.refs.marker.get(station.key),
    });

    const values = emptyValues();
    values.seq = String(index + 1);
    values.workDate = input.workDate;
    values.site = station.site;

    for (const key of REF_KEYS) {
      const override = detail?.overrides[key];
      values[key] = override !== undefined && override !== "" ? override : (ref[key] ?? "");
    }

    values.worker = detail?.worker ?? station.leaders.join(",");
    values.witness = detail?.witness ?? station.witnesses.join(",");
    values.signaler = detail?.signaler ?? station.signalers.join(",");

    values.workCategory = detail?.workCategory ?? DAY_DEFAULTS.workCategory;
    values.levelLabel = detail?.levelLabel ?? DAY_DEFAULTS.levelLabel;
    values.workTime = detail?.workTime ?? DAY_DEFAULTS.workTime;
    values.workType = detail?.workType ?? "";
    values.equipment = detail?.equipment ?? "";
    values.workContent = detail?.workContent ?? "";
    values.workDetail = detail?.workDetail ?? "";

    return {
      stationKey: station.key,
      site: station.site,
      values,
      refSource: source,
      ...(manualKeys.has(station.key) ? { isManual: true } : null),
    };
  });
}

/** 일자별 보기를 처음 열 때의 날짜: 오늘 기준 다음 날(스펙 14.1). */
export function defaultDayDate(now: Date = new Date()): string {
  return addDays(todayIso(now), 1);
}
