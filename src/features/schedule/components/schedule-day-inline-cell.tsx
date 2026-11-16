"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { InlineMoveKey } from "@/features/schedule/lib/inline-nav";
import { cn } from "@/lib/utils";

/** 목록 상자의 최대 높이(px). 아래 공간이 모자라면 위로 연다. */
const LIST_MAX_HEIGHT = 240;

interface ScheduleDayInlineCellProps {
  value: string;
  /** 목록에서 고르는 열이면 그 목록. 없으면 글만 직접 쓴다(작업내용 상세). */
  options?: readonly string[];
  maxLength: number;
  /** 수정할 수 있나(관리자·저장 가능). 아니면 일반 칸이고 클릭은 행 클릭으로 흘러간다. */
  editable: boolean;
  /** 현재 이 칸이 편집 중인가(부모가 제어) */
  active: boolean;
  /** 칸을 클릭해 편집을 시작할 때 부른다 */
  onActivate: () => void;
  /** 직렬 대기열에서 저장 중인 낙관적 값 */
  pendingValue?: string;
  /** 편집이 끝날 때 부른다(`next`가 null이면 취소, `move`는 Tab/Enter 이동 방향) */
  onFinish: (next: string | null, move: InlineMoveKey | null) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * 표 안에서 바로 고치는 칸. 클릭하면 입력칸과 목록이 열린다.
 * 목록 값을 고르거나, 직접 쓰거나 붙여 넣고 Tab/Enter(또는 다른 곳 클릭)로 저장한다. Esc는 취소.
 */
export function ScheduleDayInlineCell({
  value,
  options,
  maxLength,
  editable,
  active,
  onActivate,
  pendingValue,
  onFinish,
  className,
  style,
}: ScheduleDayInlineCellProps) {
  const cellRef = useRef<HTMLTableCellElement>(null);
  const hasPending = pendingValue !== undefined;
  const displayValue = hasPending ? pendingValue : value;

  return (
    <td
      ref={cellRef}
      title={active ? undefined : displayValue}
      style={style}
      className={cn(
        className,
        editable && !active && "cursor-text hover:bg-slate-800 hover:shadow-[inset_0_0_0_1px_rgb(99_102_241/0.6)]",
        active && "p-0",
      )}
      onClick={(event) => {
        if (!editable) return;
        // 상세 창으로 번지지 않게 한다.
        event.stopPropagation();
        if (!active) onActivate();
      }}
    >
      {active ? (
        <Editor
          value={displayValue}
          options={options}
          maxLength={maxLength}
          anchor={cellRef}
          onDone={onFinish}
        />
      ) : hasPending ? (
        <span className="italic text-slate-400">{displayValue}</span>
      ) : (
        displayValue
      )}
    </td>
  );
}

function Editor({
  value,
  options,
  maxLength,
  anchor,
  onDone,
}: {
  value: string;
  options?: readonly string[];
  maxLength: number;
  anchor: React.RefObject<HTMLTableCellElement | null>;
  /** `null`이면 취소 */
  onDone: (next: string | null, move: InlineMoveKey | null) => void;
}) {
  const [text, setText] = useState(value);
  const [typed, setTyped] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const doneRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const finish = (next: string | null, move: InlineMoveKey | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(next, move);
  };

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // 표를 스크롤하거나 창 크기를 바꾸면 목록 위치를 다시 잡는다.
  useLayoutEffect(() => {
    const update = () => setRect(anchor.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchor]);

  const needle = text.trim();
  const shown = options ? (typed && needle !== "" ? options.filter((option) => option.includes(needle)) : options) : [];

  const listStyle = (() => {
    if (!rect) return undefined;
    const openUp = rect.bottom + LIST_MAX_HEIGHT > window.innerHeight && rect.top > LIST_MAX_HEIGHT;
    return {
      left: rect.left,
      minWidth: Math.max(rect.width, 200),
      maxHeight: LIST_MAX_HEIGHT,
      ...(openUp ? { bottom: window.innerHeight - rect.top } : { top: rect.bottom }),
    } satisfies CSSProperties;
  })();

  return (
    <>
      <input
        ref={inputRef}
        value={text}
        maxLength={maxLength}
        aria-label="값 수정"
        onChange={(event) => {
          setText(event.target.value);
          setTyped(true);
        }}
        onBlur={() => finish(text, null)}
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            event.preventDefault();
            finish(text, event.shiftKey ? "Shift+Tab" : "Tab");
          } else if (event.key === "Enter") {
            event.preventDefault();
            finish(text, event.shiftKey ? "Shift+Enter" : "Enter");
          } else if (event.key === "Escape") {
            event.preventDefault();
            finish(null, null);
          }
        }}
        className="h-full min-h-9 w-full bg-slate-800 px-1.5 text-sm text-slate-100 outline-none ring-1 ring-inset ring-indigo-500"
      />
      {options && listStyle
        ? createPortal(
            <ul
              role="listbox"
              style={listStyle}
              className="fixed z-[60] overflow-y-auto rounded-md border border-slate-700 bg-slate-900 py-1 text-sm text-slate-100 shadow-lg"
            >
              {value !== "" ? (
                <li
                  role="option"
                  aria-selected={false}
                  // 입력칸이 포커스를 잃지 않게 mousedown을 막고 click에서 고른다.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => finish("", null)}
                  className="cursor-pointer px-2 py-1 text-slate-400 hover:bg-slate-800"
                >
                  (비움)
                </li>
              ) : null}
              {shown.map((option) => (
                <li
                  key={option}
                  role="option"
                  aria-selected={option === value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => finish(option, null)}
                  className={cn(
                    "cursor-pointer whitespace-nowrap px-2 py-1 hover:bg-slate-800",
                    option === value && "bg-indigo-950 text-indigo-200",
                  )}
                >
                  {option}
                </li>
              ))}
              {shown.length === 0 ? (
                <li className="px-2 py-1 text-xs text-slate-500">
                  목록에 없는 값입니다. Enter로 이 글 그대로 저장합니다.
                </li>
              ) : null}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
