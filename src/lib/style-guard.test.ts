// 스타일 가드: 점검(2026-11-13)에서 걷어낸 슬롭이 다시 생기지 않게 막는다.
// 설계: docs/Ver_3.0/Ver_3.0_스타일정리_설계.md §4.5
//
// - RULES: 금지 패턴. `glow`·`gradient`·`emoji`·`transitionAll`·`tracking`은 영구 규칙이다.
//   `bold`·`tinyText`·`radius`는 정리가 끝나면 CLEAN_SCOPES를 비워 두는 임시 규칙이다(코드는 남긴다).
// - CLEAN_SCOPES: 규칙별로 "정리가 끝났다"고 선언한 경로 접두사. 여기 적힌 곳에서 걸리면 실패한다.
// - ALLOW: 의도적으로 남기는 곳. `"경로:규칙"` → 이유. 이유 없이 넣지 않는다.
// 읽는 범위: src/**/*.{ts,tsx}(테스트와 site-survey 제외). 주석 줄은 건너뛴다.
// tailwind.config.ts·globals.css는 읽지 않는다.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type RuleId = "glow" | "gradient" | "emoji" | "transitionAll" | "tracking" | "bold" | "tinyText" | "radius";

const RULES: Record<RuleId, { pattern: RegExp; hint: string }> = {
  glow: { pattern: /shadow-glow/, hint: "글로 대신 헤어라인 테두리와 표면 한 단계를 쓴다" },
  gradient: { pattern: /bg-gradient-|bg-clip-text|text-transparent/, hint: "그라디언트·그라디언트 글자 대신 단색" },
  emoji: {
    pattern: /[\u{1F300}-\u{1FAFF}⚠⛔⭐]/u,
    hint: "그림 이모지 대신 lucide 아이콘(장식이면 지운다)",
  },
  transitionAll: { pattern: /transition-all/, hint: "transition-colors 등 바뀌는 속성만 지정한다" },
  tracking: { pattern: /\buppercase\b|tracking-(wider|widest)/, hint: "대문자·넓은 자간 대신 보통 자간" },
  bold: { pattern: /font-(bold|extrabold|black)/, hint: "font-semibold 이하" },
  tinyText: { pattern: /text-\[(9|10)px\]/, hint: "11px 이상" },
  radius: {
    pattern: /(?<![\w-])rounded(?![-\w[])|(?<![\w-])rounded-xl\b/,
    hint: "단독 rounded는 rounded-sm, rounded-xl은 rounded-lg",
  },
};

/** 정리가 끝난 범위(경로 접두사). 단계가 진행되며 넓어진다 */
const CLEAN_SCOPES: Record<RuleId, string[]> = {
  glow: ["src"],
  gradient: ["src"],
  emoji: ["src"],
  transitionAll: ["src"],
  tracking: ["src"],
  bold: [], // 임시 규칙: 정리 끝(2026-11-13). 다시 막으려면 ["src"]
  tinyText: [], // 임시 규칙: 정리 끝(2026-11-13). 다시 막으려면 ["src"]
  radius: [], // 임시 규칙: 정리 끝(2026-11-13). 다시 막으려면 ["src"]
};

/** 의도적으로 남기는 곳: "경로:규칙" → 이유 */
const ALLOW: Record<string, string> = {
  "src/features/schedule/components/schedule-legend.tsx:bold": "범례가 굵은 파란 글자 자체를 보여 준다",
  "src/features/worksite-weather/types/weather.ts:emoji": "날씨 판정 신호(VERDICT_ICON). 상태 점으로의 교체는 별도 작업",
};

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("/*") || t.startsWith("*") || t.startsWith("{/*");
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name).replace(/\\/g, "/");
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && !path.includes("/site-survey/")) out.push(path);
  }
}

let cache: { file: string; lines: string[] }[] | null = null;
function sources(): { file: string; lines: string[] }[] {
  if (!cache) {
    const files: string[] = [];
    walk("src", files);
    cache = files.map((file) => ({ file, lines: readFileSync(file, "utf-8").split(/\r?\n/) }));
  }
  return cache;
}

function scan(rule: RuleId, scopes: string[]): { file: string; line: number; text: string }[] {
  const found: { file: string; line: number; text: string }[] = [];
  for (const { file, lines } of sources()) {
    if (!scopes.some((scope) => file.startsWith(scope))) continue;
    if (`${file}:${rule}` in ALLOW) continue;
    lines.forEach((text, i) => {
      if (!isCommentLine(text) && RULES[rule].pattern.test(text)) found.push({ file, line: i + 1, text: text.trim().slice(0, 100) });
    });
  }
  return found;
}

describe("규칙 정규식", () => {
  const cases: [RuleId, string[], string[]][] = [
    ["glow", ["hover:shadow-glow", "shadow-glow-sm"], ["shadow-lg"]],
    ["gradient", ["bg-gradient-to-b", "bg-clip-text", "text-transparent"], ["bg-transparent"]],
    ["emoji", ["⚠️ 경고", "📅 일정", "⛔ 금지", "🟨 지도"], ["경고", "✓", "✕", "★", "⚪"]],
    ["transitionAll", ["transition-all"], ["transition-colors"]],
    ["tracking", ["uppercase", "tracking-wider", "tracking-widest"], ["tracking-tight"]],
    ["bold", ["font-bold", "font-extrabold", "font-black"], ["font-semibold"]],
    ["tinyText", ["text-[9px]", "text-[10px]"], ["text-[11px]"]],
    ["radius", ["rounded", "rounded ", "md:rounded", "rounded-xl", "md:rounded-xl"], ["rounded-md", "rounded-lg", "rounded-full", "rounded-sm", "rounded-[4px]"]],
  ];
  it.each(cases)("%s", (rule, hits, misses) => {
    for (const s of hits) expect(RULES[rule].pattern.test(s), `잡아야 함: ${s}`).toBe(true);
    for (const s of misses) expect(RULES[rule].pattern.test(s), `잡지 않아야 함: ${s}`).toBe(false);
  });
});

describe("주석 줄 판정", () => {
  it("주석 줄은 true, 코드 줄은 false", () => {
    for (const s of ["// ⛔ 주석", " * ⚠️ 설명", "/* 설명 */", "{/* 설명 */}"]) expect(isCommentLine(s), s).toBe(true);
    expect(isCommentLine('const a = "⛔"')).toBe(false);
  });
});

describe("검사 대상", () => {
  it("site-survey(Astryx 화면)는 읽지 않는다", () => {
    expect(scan("glow", ["src/features/site-survey"])).toEqual([]);
    expect(sources().some((s) => s.file.includes("/site-survey/"))).toBe(false);
  });

  it("src의 ts·tsx 파일을 읽는다", () => {
    expect(sources().length).toBeGreaterThan(100);
    expect(sources().some((s) => s.file.endsWith("overlay-content.ts"))).toBe(true);
  });
});

describe("정리된 범위에 슬롭이 없다", () => {
  for (const rule of Object.keys(RULES) as RuleId[]) {
    it(rule, () => {
      const found = scan(rule, CLEAN_SCOPES[rule]).map((f) => `${f.file}:${f.line}  ${f.text}`);
      expect(found, `${RULES[rule].hint}\n`).toEqual([]);
    });
  }
});
