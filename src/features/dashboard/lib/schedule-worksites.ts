import type { ScheduleCell } from "@/features/schedule/types";
import {
  isSubCandidate,
  normalize,
  parseWorkType,
  type SiteCandidate,
} from "@/features/worksite-weather/lib/site-search";
import type { ScheduleSyncRecord, SiteMatch } from "@/features/worksite-weather/types/weather";

/**
 * 시설일정의 오늘 국소를 대시보드 작업 국소(날씨 판정 보드)에 자동으로 담는 계산(순수 함수).
 * 일정 칸의 국소명을 장비 마커와 이름으로 연결하고, 이미 저장된 작업 국소와 합칠 목록을 정한다.
 */

export interface ScheduleMatchResult {
  matches: SiteMatch[];
  /** 장비 국소와 이름이 연결된 일정 국소명 개수(같은 대표로 이어져도 이름마다 센다) */
  matchedCount: number;
  /** 연결하지 못한 일정 국소명(등록된 국소가 아니거나 좌표가 없음) */
  unmatched: string[];
}

/** 오늘 일정 칸의 `국소·작업` 글. 입회·신호수·장비 줄(국소 칸이 빈 칸)은 빠진다. 중복 없이 행 순서대로. */
export function todayStationNames(cells: ScheduleCell[], today: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  const sorted = cells
    .filter((cell) => cell.workDate === today)
    .sort((a, b) => a.rowNo - b.rowNo || a.columnId.localeCompare(b.columnId));
  for (const cell of sorted) {
    const name = cell.mainText.trim();
    if (name === "" || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function hasCoords(candidate: SiteCandidate): boolean {
  return Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng);
}

function keysOf(candidate: SiteCandidate): string[] {
  const aliases = (candidate.siteAlias ?? "").split(",");
  return [
    ...new Set(
      [candidate.stationName, candidate.name, ...aliases]
        .map((value) => normalize(value ?? ""))
        .filter(Boolean),
    ),
  ];
}

/**
 * 일정 국소명을 장비 마커와 연결한다. 장비 국소명·이름·별칭이 같으면(공백·하이픈·대소문자 무시) 일치다.
 * 같은 이름이 여럿이면 대표·단독을 SUB보다 먼저 쓰고, SUB는 대표 마커의 id·좌표·주소로 연결한다
 * (지도에는 대표만 있어 SUB id로는 날씨 카드가 열리지 않는다). 표시 이름은 일정에 적은 마커의 이름이다.
 */
export function matchScheduleStations(
  names: string[],
  candidates: SiteCandidate[],
): ScheduleMatchResult {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const byKey = new Map<string, SiteCandidate[]>();
  for (const candidate of candidates) {
    if (!hasCoords(candidate)) continue;
    for (const key of keysOf(candidate)) {
      const list = byKey.get(key) ?? [];
      list.push(candidate);
      byKey.set(key, list);
    }
  }

  const matches = new Map<string, SiteMatch>();
  const unmatched: string[] = [];
  let matchedCount = 0;

  for (const name of names) {
    const found = byKey.get(normalize(name)) ?? [];
    const chosen = found.find((candidate) => !isSubCandidate(candidate)) ?? found[0];
    if (!chosen) {
      unmatched.push(name);
      continue;
    }
    matchedCount += 1;
    const parent = chosen.parentMarkerId ? byId.get(chosen.parentMarkerId) : undefined;
    const representative =
      isSubCandidate(chosen) && parent && hasCoords(parent) ? parent : chosen;
    if (matches.has(representative.id)) continue;
    matches.set(representative.id, {
      id: representative.id,
      name: chosen.name || chosen.stationName || "(이름 없음)",
      address: representative.address ?? "",
      lat: representative.lat,
      lng: representative.lng,
      workType: parseWorkType(representative.workType),
      matchedBy: "name",
    });
  }

  return { matches: [...matches.values()], matchedCount, unmatched };
}

export interface ScheduleSyncPlan {
  sites: SiteMatch[];
  sync: ScheduleSyncRecord;
  changed: boolean;
}

/**
 * 저장된 작업 국소와 오늘 일정의 연결 결과를 합친다.
 * - 직접 담은 국소(`scheduleDate` 없음)는 그대로 두고, 같은 국소는 중복해서 넣지 않는다.
 * - 자동 등록된 국소는 오늘 일정에 있으면 오늘 날짜로 유지·갱신하고, 없으면(지난 날짜 포함) 뺀다.
 * - 새로 일치한 국소는 오늘 날짜를 달아 넣는다. 같은 날 이미 넣어 본 국소를 사용자가 뺐다면 다시 넣지 않는다.
 * `changed`가 false면 `sites`는 입력 `saved` 그대로다.
 */
export function planScheduleSync(input: {
  saved: SiteMatch[];
  matches: SiteMatch[];
  today: string;
  previous: ScheduleSyncRecord | null;
}): ScheduleSyncPlan {
  const { saved, matches, today, previous } = input;
  const matchIds = new Set(matches.map((match) => match.id));
  const savedIds = new Set(saved.map((site) => site.id));
  const alreadySynced = new Set(previous?.date === today ? previous.ids : []);

  let listChanged = false;
  const droppedIds = new Set<string>();
  const kept: SiteMatch[] = [];
  for (const site of saved) {
    if (site.scheduleDate === undefined) {
      kept.push(site);
    } else if (matchIds.has(site.id)) {
      if (site.scheduleDate === today) {
        kept.push(site);
      } else {
        kept.push({ ...site, scheduleDate: today });
        listChanged = true;
      }
    } else {
      droppedIds.add(site.id);
      listChanged = true;
    }
  }

  const additions = matches
    .filter((match) => !savedIds.has(match.id) && !alreadySynced.has(match.id))
    .map((match) => ({ ...match, scheduleDate: today }));
  if (additions.length > 0) listChanged = true;

  const syncedIds = [
    ...new Set([...[...alreadySynced].filter((id) => !droppedIds.has(id)), ...matchIds]),
  ];
  const sync: ScheduleSyncRecord = { date: today, ids: syncedIds };
  const syncChanged =
    previous?.date !== today ||
    previous.ids.length !== syncedIds.length ||
    previous.ids.some((id) => !syncedIds.includes(id));

  return {
    sites: listChanged ? [...kept, ...additions] : saved,
    sync,
    changed: listChanged || syncChanged,
  };
}
