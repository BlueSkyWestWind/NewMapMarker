import type { EntryDraft } from "@/features/schedule/lib/group-edit";

/**
 * 일정 목록의 줄 입력에서 국소를 검색해 **여러 개** 고르는 동작(순수 함수).
 * 검색하던 줄(anchor)이 첫 번째 선택으로 채워지고, 이어서 고른 국소는 바로 아래에 새 줄로 들어간다.
 * 이미 고른 국소를 다시 누르면 선택이 풀리고 새로 만든 줄은 사라진다(첫 선택은 검색하던 글로 되돌린다).
 * 목록에 원래 있던 국소는 이번 선택이 아니므로 눌러도 바뀌지 않는다.
 */

export interface PickSession {
  /** 검색하던 줄 */
  anchorKey: string;
  /** 검색어(검색하던 글). 첫 선택을 풀 때 되돌린다 */
  query: string;
  /** 이번에 고른 국소(고른 순서). key는 그 국소가 들어 있는 줄 */
  picks: { label: string; key: string }[];
}

export function startPickSession(anchorKey: string, query: string): PickSession {
  return { anchorKey, query, picks: [] };
}

function insertAfter(drafts: EntryDraft[], afterKey: string, entry: EntryDraft): EntryDraft[] {
  const index = drafts.findIndex((draft) => draft.key === afterKey);
  if (index === -1) return [...drafts, entry];
  return [...drafts.slice(0, index + 1), entry, ...drafts.slice(index + 1)];
}

export function pickStation(input: {
  drafts: EntryDraft[];
  session: PickSession;
  label: string;
  /** 새 줄의 키를 만든다 */
  newKey: () => string;
}): { drafts: EntryDraft[]; session: PickSession } {
  const { drafts, session, newKey } = input;
  const name = input.label.trim();
  if (name === "") return { drafts, session };

  const already = session.picks.find((pick) => pick.label === name);
  if (already) {
    const picks = session.picks.filter((pick) => pick !== already);
    const next =
      already.key === session.anchorKey
        ? drafts.map((draft) =>
            draft.key === already.key ? { ...draft, mainText: session.query } : draft,
          )
        : drafts.filter((draft) => draft.key !== already.key);
    return { drafts: next, session: { ...session, picks } };
  }

  // 목록에 원래 있던 국소는 건드리지 않는다.
  if (drafts.some((draft) => draft.mainText.trim() === name)) return { drafts, session };

  if (session.picks.length === 0 && drafts.some((draft) => draft.key === session.anchorKey)) {
    return {
      drafts: drafts.map((draft) =>
        draft.key === session.anchorKey ? { ...draft, mainText: name } : draft,
      ),
      session: { ...session, picks: [{ label: name, key: session.anchorKey }] },
    };
  }

  const key = newKey();
  const lastKey = session.picks[session.picks.length - 1]?.key ?? session.anchorKey;
  const entry: EntryDraft = {
    key,
    id: null,
    rowNo: null,
    mainText: name,
    subText: "",
    textColor: null,
    companionTarget: false,
  };
  return {
    drafts: insertAfter(drafts, lastKey, entry),
    session: { ...session, picks: [...session.picks, { label: name, key }] },
  };
}
