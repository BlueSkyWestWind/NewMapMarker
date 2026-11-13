// 의존 방향 가드: 공용 레이어(src/lib)가 피처(src/features)를 import하는 역방향 의존을 막는다.
// 설계: docs/Ver_3.0/의존방향정리/Ver_3.0_의존방향정리_설계.md §3.2

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type ArchRuleId = "no-lib-to-feature";

/** 의도적 예외: "경로:규칙" → 이유. 이유 없이 넣지 않는다. */
const ALLOW: Partial<Record<`${string}:${ArchRuleId}`, string>> = {
  "src/lib/api/kakao-route-upstream.ts:no-lib-to-feature":
    "서버 전용 카카오 길찾기 모듈이 @/features/route/types/route의 타입만 import type으로 참조한다. 타입을 src/types/로 옮기는 후속 작업 전까지 허용",
};

const IMPORT_FEATURE_RE = /from\s+["']@\/features\//;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name).replace(/\\/g, "/");
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) {
      out.push(path);
    }
  }
}

function findMatchingLines(filePath: string, pattern: RegExp): { line: number; text: string }[] {
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const hits: { line: number; text: string }[] = [];
  lines.forEach((raw, idx) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    if (pattern.test(raw)) hits.push({ line: idx + 1, text: trimmed });
  });
  return hits;
}

describe("arch-guard", () => {
  it("no-lib-to-feature: src/lib/** 는 @/features/ 를 import하지 않는다", () => {
    const libFiles: string[] = [];
    walk("src/lib", libFiles);

    const violations: string[] = [];
    for (const file of libFiles) {
      if (ALLOW[`${file}:no-lib-to-feature`]) continue;
      for (const hit of findMatchingLines(file, IMPORT_FEATURE_RE)) {
        violations.push(`${file}:${hit.line}: ${hit.text}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("허용 예외로 적은 파일이 실제로 존재한다(지워진 예외가 남지 않게)", () => {
    for (const key of Object.keys(ALLOW)) {
      const file = key.split(":")[0];
      expect(() => statSync(file), `${file} 이(가) 없다. ALLOW에서 지운다`).not.toThrow();
    }
  });
});
