import { describe, expect, it } from "vitest";
import {
  createUndoStack,
  isResultEntry,
  type ResultUndoEntry,
  type UndoEntry,
} from "@/features/schedule/lib/undo-stack";

function entry(label: string): UndoEntry {
  return {
    label,
    before: [{ workDate: "2026-11-09", columnId: "col-a", baseIds: [], cells: [] }],
    marksBefore: [],
    after: [{ workDate: "2026-11-09", columnId: "col-a", baseIds: [], cells: [] }],
  };
}

describe("createUndoStack", () => {
  it("빈 스택에서 pop하면 undefined이고 size는 0이다", () => {
    const stack = createUndoStack();
    expect(stack.size).toBe(0);
    expect(stack.pop()).toBeUndefined();
  });

  it("push 후 pop은 최근 항목부터(LIFO) 꺼낸다", () => {
    const stack = createUndoStack();
    stack.push(entry("첫째"));
    stack.push(entry("둘째"));
    expect(stack.size).toBe(2);
    expect(stack.pop()?.label).toBe("둘째");
    expect(stack.pop()?.label).toBe("첫째");
    expect(stack.pop()).toBeUndefined();
    expect(stack.size).toBe(0);
  });

  it("기본 한도(20)를 넘기면 가장 오래된 항목이 밀려난다", () => {
    const stack = createUndoStack();
    for (let i = 1; i <= 22; i += 1) {
      stack.push(entry(`작업-${i}`));
    }
    expect(stack.size).toBe(20);
    const popped: string[] = [];
    while (stack.size > 0) {
      popped.push(stack.pop()!.label);
    }
    expect(popped[0]).toBe("작업-22");
    expect(popped[popped.length - 1]).toBe("작업-3");
  });

  it("limit을 지정하면 그 개수만큼만 유지한다", () => {
    const stack = createUndoStack(2);
    stack.push(entry("A"));
    stack.push(entry("B"));
    stack.push(entry("C"));
    expect(stack.size).toBe(2);
    expect(stack.pop()?.label).toBe("C");
    expect(stack.pop()?.label).toBe("B");
  });

  it("clear는 스택을 비운다", () => {
    const stack = createUndoStack();
    stack.push(entry("A"));
    stack.push(entry("B"));
    stack.clear();
    expect(stack.size).toBe(0);
    expect(stack.pop()).toBeUndefined();
  });

  it("result 항목도 같은 스택에 push/pop 되고 isResultEntry로 구분된다", () => {
    const stack = createUndoStack();
    const groupEntry = entry("그룹");
    const resultEntry: ResultUndoEntry = {
      kind: "result",
      label: "국소1 완료 기록",
      cellId: "cell-1",
      before: null,
      after: { status: "done", reason: "", rescheduledTo: null },
    };

    stack.push(groupEntry);
    stack.push(resultEntry);

    const popped1 = stack.pop();
    expect(popped1).toEqual(resultEntry);
    expect(popped1 && isResultEntry(popped1)).toBe(true);

    const popped2 = stack.pop();
    expect(popped2).toEqual(groupEntry);
    expect(popped2 && isResultEntry(popped2)).toBe(false);
  });
});
