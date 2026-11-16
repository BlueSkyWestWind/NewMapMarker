import { MAX_ROWS } from "@/features/schedule/lib/cell-grid";
import { planCompanionArrangement } from "@/features/schedule/lib/companion-arrange";
import type {
  CellPosition,
  CellResult,
  ScheduleCell,
  ScheduleTextInput,
  TextColor,
} from "@/features/schedule/types";

export interface GroupKey {
  workDate: string;
  columnId: string;
}

export interface GroupCell {
  id: string | null;
  rowNo: number;
  mainText: string;
  subText: string;
  textColor: TextColor | null;
  companionTarget?: boolean;
  /** 되돌리기로 지워진 칸을 복원할 때만 쓴다. */
  result?: CellResult | null;
}

export interface GroupState extends GroupKey {
  baseIds: string[];
  cells: GroupCell[];
}

export type WriteOp =
  | { op: "create"; position: CellPosition; text: ScheduleTextInput }
  | { op: "update"; id: string; text: ScheduleTextInput }
  | { op: "delete"; id: string };

interface WorkingCell extends ScheduleCell {
  /** 새로 만들었거나 다른 그룹에서 옮겨 온 칸이면 DB에서 INSERT하도록 id를 null로 내보낸다. */
  isNewOrMoved: boolean;
}

function groupKeyOf(workDate: string, columnId: string): string {
  return `${workDate}|${columnId}`;
}

function toGroupCell(cell: ScheduleCell, idOverride?: string | null): GroupCell {
  return {
    id: idOverride === undefined ? cell.id : idOverride,
    rowNo: cell.rowNo,
    mainText: cell.mainText,
    subText: cell.subText,
    textColor: cell.textColor,
    companionTarget: cell.companionTarget === true,
    result: cell.result ?? null,
  };
}

/** 지정한 (workDate, columnId) 그룹들의 현재 상태 스냅샷을 만든다. */
export function snapshotGroups(cells: ScheduleCell[], keys: GroupKey[]): GroupState[] {
  const seen = new Set<string>();
  const result: GroupState[] = [];

  for (const key of keys) {
    const id = groupKeyOf(key.workDate, key.columnId);
    if (seen.has(id)) continue;
    seen.add(id);

    const group = cells
      .filter((cell) => cell.workDate === key.workDate && cell.columnId === key.columnId)
      .sort((a, b) => a.rowNo - b.rowNo);

    result.push({
      workDate: key.workDate,
      columnId: key.columnId,
      baseIds: group.map((cell) => cell.id),
      cells: group.map((cell) => toGroupCell(cell)),
    });
  }

  return result;
}

function findSmallestFreeRow(working: WorkingCell[], workDate: string, columnId: string): number {
  const used = new Set(
    working
      .filter((cell) => cell.workDate === workDate && cell.columnId === columnId)
      .map((cell) => cell.rowNo),
  );
  for (let row = 0; row < MAX_ROWS; row += 1) {
    if (!used.has(row)) return row;
  }
  throw new Error("column is full");
}

function arrangeGroupInPlace(working: WorkingCell[], workDate: string, columnId: string): void {
  const group = working.filter((cell) => cell.workDate === workDate && cell.columnId === columnId);
  if (group.length === 0) return;

  const byId = new Map(group.map((cell) => [cell.id, cell]));
  for (const step of planCompanionArrangement(group)) {
    const moving = byId.get(step.id);
    if (!moving || moving.rowNo === step.toRow) continue;
    const occupant = group.find((cell) => cell.rowNo === step.toRow && cell.id !== moving.id);
    if (occupant) occupant.rowNo = moving.rowNo;
    moving.rowNo = step.toRow;
  }
}

/**
 * 계획 함수가 낸 ops와 날짜·팀 이동을 현재 칸 위에 시뮬레이션해
 * 영향받은 그룹의 최종 상태를 돌려준다.
 *
 * @remarks
 * - `input.cells`는 영향받는 그룹의 칸을 **모두** 포함해야 한다(`baseIds`가 여기서 나온다).
 * - 도착 그룹이 가득 차면 `findSmallestFreeRow`가 오류를 던진다(호출부가 사전 검사한다).
 */
export function applyOpsToGroups(input: {
  cells: ScheduleCell[];
  ops: WriteOp[];
  moveTo?: { workDate: string; columnId: string; ids: string[]; includeCreated?: boolean };
  arrange: boolean;
}): GroupState[] {
  const working: WorkingCell[] = input.cells.map((cell) => ({
    ...cell,
    isNewOrMoved: false,
  }));

  const touched = new Map<string, GroupKey>();
  const touch = (workDate: string, columnId: string) => {
    const k = groupKeyOf(workDate, columnId);
    if (!touched.has(k)) touched.set(k, { workDate, columnId });
  };

  let createdSeq = 0;
  const createdCells: WorkingCell[] = [];
  for (const op of input.ops) {
    if (op.op === "delete") {
      const idx = working.findIndex((cell) => cell.id === op.id);
      if (idx !== -1) {
        touch(working[idx].workDate, working[idx].columnId);
        working.splice(idx, 1);
      }
      continue;
    }

    if (op.op === "update") {
      const target = working.find((cell) => cell.id === op.id);
      if (!target) continue;
      touch(target.workDate, target.columnId);
      target.mainText = op.text.mainText;
      target.subText = op.text.subText;
      target.textColor = op.text.textColor;
      if (op.text.companionTarget !== undefined) {
        target.companionTarget = op.text.companionTarget;
      }
      continue;
    }

    createdSeq += 1;
    touch(op.position.workDate, op.position.columnId);
    const created: WorkingCell = {
      id: `__new_${createdSeq}`,
      workDate: op.position.workDate,
      columnId: op.position.columnId,
      rowNo: op.position.rowNo,
      mainText: op.text.mainText,
      subText: op.text.subText,
      textColor: op.text.textColor,
      companionTarget: op.text.companionTarget === true,
      result: null,
      isNewOrMoved: true,
    };
    working.push(created);
    createdCells.push(created);
  }

  if (input.moveTo) {
    const { workDate: destDate, columnId: destCol, ids, includeCreated } = input.moveTo;
    touch(destDate, destCol);

    const targets: WorkingCell[] = [];
    const seenIds = new Set<string>();
    for (const id of ids) {
      if (seenIds.has(id)) continue;
      const target = working.find((cell) => cell.id === id);
      if (!target) continue;
      seenIds.add(id);
      targets.push(target);
    }
    if (includeCreated) {
      for (const created of createdCells) {
        if (!seenIds.has(created.id)) {
          seenIds.add(created.id);
          targets.push(created);
        }
      }
    }

    // 이동 전 rowNo 오름차순(같으면 입력 순서)으로 도착 팀 빈 행에 차례로 옮긴다.
    targets.sort((a, b) => a.rowNo - b.rowNo);
    for (const target of targets) {
      touch(target.workDate, target.columnId);
      const changedGroup = target.workDate !== destDate || target.columnId !== destCol;
      const freeRow = findSmallestFreeRow(working, destDate, destCol);
      target.workDate = destDate;
      target.columnId = destCol;
      target.rowNo = freeRow;
      if (changedGroup) target.isNewOrMoved = true;
    }
  }

  if (input.arrange) {
    for (const { workDate, columnId } of touched.values()) {
      arrangeGroupInPlace(working, workDate, columnId);
    }
  }

  const result: GroupState[] = [];
  for (const { workDate, columnId } of touched.values()) {
    const baseIds = input.cells
      .filter((cell) => cell.workDate === workDate && cell.columnId === columnId)
      .map((cell) => cell.id);
    const finalCells = working
      .filter((cell) => cell.workDate === workDate && cell.columnId === columnId)
      .sort((a, b) => a.rowNo - b.rowNo)
      .map((cell) => toGroupCell(cell, cell.isNewOrMoved ? null : cell.id));

    result.push({
      workDate,
      columnId,
      baseIds,
      cells: finalCells,
    });
  }

  return result;
}

/** before에 있고 after에 없는 기존 칸 id의 수를 센다. */
export function countDeletes(before: GroupState[], after: GroupState[]): number {
  const afterIds = new Set<string>();
  for (const group of after) {
    for (const cell of group.cells) {
      if (cell.id !== null) afterIds.add(cell.id);
    }
  }

  const beforeIds = new Set<string>();
  for (const group of before) {
    for (const cell of group.cells) {
      if (cell.id !== null) beforeIds.add(cell.id);
    }
  }

  let deleted = 0;
  for (const id of beforeIds) {
    if (!afterIds.has(id)) deleted += 1;
  }
  return deleted;
}

export interface CreatedCellRef {
  groupIndex: number;
  cellIndex: number;
  id: string;
}

/**
 * `apply_schedule_groups` RPC가 돌려준 신규 칸 id를 `after` 스냅샷에 채워 넣는다.
 * 되돌리기 시 `after`의 `baseIds`가 실제 DB id 집합과 일치하도록 각 그룹의 `baseIds`도 갱신한다.
 */
export function fillCreatedIds(after: GroupState[], created: CreatedCellRef[]): GroupState[] {
  const next: GroupState[] = after.map((group) => ({
    ...group,
    baseIds: [...group.baseIds],
    cells: group.cells.map((cell) => ({ ...cell })),
  }));

  for (const item of created) {
    const cell = next[item.groupIndex]?.cells[item.cellIndex];
    if (cell) {
      cell.id = item.id;
    }
  }

  for (const group of next) {
    group.baseIds = group.cells
      .map((cell) => cell.id)
      .filter((id): id is string => id !== null);
  }

  return next;
}

/**
 * 되돌리기용 그룹 목록을 만든다.
 * `before`의 칸들을 복원하되, 서버 충돌 검사용 `baseIds`는 저장 직후 상태(`after`)의 id 집합을 쓴다.
 */
export function buildRestoreGroups(before: GroupState[], after: GroupState[]): GroupState[] {
  const afterByKey = new Map(
    after.map((group) => [groupKeyOf(group.workDate, group.columnId), group]),
  );

  return before.map((group) => {
    const matched = afterByKey.get(groupKeyOf(group.workDate, group.columnId));
    const baseIds = matched
      ? matched.cells.map((cell) => cell.id).filter((id): id is string => id !== null)
      : [...group.baseIds];
    return {
      ...group,
      baseIds,
    };
  });
}
