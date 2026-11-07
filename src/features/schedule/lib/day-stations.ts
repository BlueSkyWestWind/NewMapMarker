import { findCompanions, parseCompanionText } from "@/features/schedule/lib/companions";
import type { ScheduleCell, ScheduleColumn } from "@/features/schedule/types";

/**
 * 하루 일정에서 국소 목록을 만든다(순수 함수, 스펙 14.3).
 * 팀 열(비고 제외)의 국소명을 모아 같은 국소를 한 행으로 합치고,
 * 그 국소를 맡은 팀들의 팀장·입회자·신호수 이름을 모은다.
 */

/** 팀 대표 열에서 빼는 열 이름. 시험팀·실사&재하도급은 포함한다. */
export const NOTE_COLUMN_LABEL = "비고";

/** 같은 국소 비교 키: 공백을 모두 지우고 소문자로 바꾼다. */
export function stationKey(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

export interface DayStation {
  key: string;
  /** 처음 나온 표기 */
  site: string;
  leaders: string[];
  witnesses: string[];
  signalers: string[];
}

interface StationDraft {
  key: string;
  site: string;
  /** 처음 나온 위치(열 순서, 행 번호) */
  columnIndex: number;
  rowNo: number;
  /** 이 국소를 맡은 열 번호(중복 없음) */
  columnIndexes: Set<number>;
}

/** `홍길동, 김철수`처럼 쉼표로 이은 이름을 쪼개 빈 값 없이 돌려준다. */
function splitNames(names: string): string[] {
  return names
    .split(/[,，]/)
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

function pushUnique(target: string[], names: string[]): void {
  for (const name of names) {
    if (!target.includes(name)) target.push(name);
  }
}

export function buildDayStations(input: {
  workDate: string;
  columns: ScheduleColumn[];
  cells: ScheduleCell[];
}): DayStation[] {
  const { workDate } = input;
  const teamColumns = input.columns
    .filter((column) => column.teamLabel.trim() !== NOTE_COLUMN_LABEL)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const columnIndexById = new Map(teamColumns.map((column, index) => [column.id, index]));

  const dayCells = input.cells
    .filter(
      (cell) =>
        cell.workDate === workDate &&
        columnIndexById.has(cell.columnId) &&
        cell.mainText.trim() !== "",
    )
    .sort(
      (a, b) =>
        a.rowNo - b.rowNo ||
        (columnIndexById.get(a.columnId) ?? 0) - (columnIndexById.get(b.columnId) ?? 0),
    );

  // 행 순서 → 열 순서로 훑어 처음 나온 위치를 기록한다.
  const drafts = new Map<string, StationDraft>();
  for (const cell of dayCells) {
    const site = cell.mainText.trim();
    const key = stationKey(site);
    const columnIndex = columnIndexById.get(cell.columnId) ?? 0;
    const draft = drafts.get(key);
    if (draft) {
      draft.columnIndexes.add(columnIndex);
      continue;
    }
    drafts.set(key, { key, site, columnIndex, rowNo: cell.rowNo, columnIndexes: new Set([columnIndex]) });
  }

  const companionsByColumn = teamColumns.map((column) => findCompanions(input.cells, workDate, column.id));
  const companionNames = (columnIndex: number, kind: "입회" | "신호수"): string[] => {
    const subText = companionsByColumn[columnIndex][kind]?.subText;
    return subText === undefined ? [] : splitNames(parseCompanionText(subText)?.names ?? "");
  };

  return [...drafts.values()]
    .sort((a, b) => a.columnIndex - b.columnIndex || a.rowNo - b.rowNo)
    .map((draft) => {
      const leaders: string[] = [];
      const witnesses: string[] = [];
      const signalers: string[] = [];
      for (const columnIndex of [...draft.columnIndexes].sort((a, b) => a - b)) {
        pushUnique(leaders, [teamColumns[columnIndex].leaderLabel.trim()].filter((name) => name !== ""));
        pushUnique(witnesses, companionNames(columnIndex, "입회"));
        pushUnique(signalers, companionNames(columnIndex, "신호수"));
      }
      return { key: draft.key, site: draft.site, leaders, witnesses, signalers };
    });
}
