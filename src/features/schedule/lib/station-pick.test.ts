import { describe, expect, it } from "vitest";
import type { EntryDraft } from "./group-edit";
import { pickStation, startPickSession } from "./station-pick";

function draft(key: string, mainText: string, id: string | null = null): EntryDraft {
  return { key, id, rowNo: null, mainText, subText: "", textColor: null, companionTarget: false };
}

function keyGenerator() {
  let count = 0;
  return () => `new-${(count += 1)}`;
}

const mainTexts = (drafts: EntryDraft[]) => drafts.map((entry) => entry.mainText);

describe("pickStation — 줄 입력의 검색 결과에서 여러 개 고르기", () => {
  it("첫 번째로 고른 국소는 검색하던 줄의 글을 바꾼다", () => {
    const result = pickStation({
      drafts: [draft("row1", "동문동"), draft("row2", "다른줄")],
      session: startPickSession("row1", "동문동"),
      label: "동문동-RFIU_1_이",
      newKey: keyGenerator(),
    });
    expect(mainTexts(result.drafts)).toEqual(["동문동-RFIU_1_이", "다른줄"]);
    expect(result.session.picks).toEqual([{ label: "동문동-RFIU_1_이", key: "row1" }]);
  });

  it("이어서 고른 국소는 이전에 고른 줄 바로 아래에 새 줄로 들어간다", () => {
    const newKey = keyGenerator();
    let state = {
      drafts: [draft("row1", "동문동"), draft("row2", "다른줄")],
      session: startPickSession("row1", "동문동"),
    };
    for (const label of ["가국소", "나국소", "다국소"]) {
      state = pickStation({ ...state, label, newKey });
    }
    expect(mainTexts(state.drafts)).toEqual(["가국소", "나국소", "다국소", "다른줄"]);
    expect(state.drafts.slice(1, 3).map((entry) => [entry.id, entry.rowNo, entry.key])).toEqual([
      [null, null, "new-1"],
      [null, null, "new-2"],
    ]);
  });

  it("이미 고른 국소를 다시 누르면 선택이 풀리고 새로 만든 줄은 사라진다", () => {
    const newKey = keyGenerator();
    let state = {
      drafts: [draft("row1", "동문동")],
      session: startPickSession("row1", "동문동"),
    };
    state = pickStation({ ...state, label: "가국소", newKey });
    state = pickStation({ ...state, label: "나국소", newKey });
    state = pickStation({ ...state, label: "나국소", newKey });
    expect(mainTexts(state.drafts)).toEqual(["가국소"]);
    expect(state.session.picks).toEqual([{ label: "가국소", key: "row1" }]);
  });

  it("첫 선택을 풀면 검색하던 글로 되돌린다", () => {
    const newKey = keyGenerator();
    let state = {
      drafts: [draft("row1", "동문동")],
      session: startPickSession("row1", "동문동"),
    };
    state = pickStation({ ...state, label: "가국소", newKey });
    state = pickStation({ ...state, label: "가국소", newKey });
    expect(mainTexts(state.drafts)).toEqual(["동문동"]);
    expect(state.session.picks).toEqual([]);
  });

  it("목록에 원래 있던 국소(이번에 고른 것이 아닌)를 누르면 아무 일도 없다", () => {
    const existing = draft("saved", "있던국소", "cell-1");
    const state = {
      drafts: [draft("row1", "동문동"), existing],
      session: startPickSession("row1", "동문동"),
    };
    const result = pickStation({ ...state, label: "있던국소", newKey: keyGenerator() });
    expect(result.drafts).toBe(state.drafts);
    expect(result.session).toBe(state.session);
  });

  it("처음 고른 줄이 기존 일정이어도 글만 바꾸고 id는 그대로 둔다", () => {
    const result = pickStation({
      drafts: [draft("saved", "옛이름", "cell-1")],
      session: startPickSession("saved", "옛이름"),
      label: "새이름",
      newKey: keyGenerator(),
    });
    expect(result.drafts[0]).toMatchObject({ key: "saved", id: "cell-1", mainText: "새이름" });
  });
});
