import type { CctvDirection } from "@/features/cctv/types/cctv";

/**
 * CCTV 명칭에서 촬영 방향을 파싱한다 (계획서 §5.3).
 *
 * 표준링크는 도로중심선을 방향별로 이격시켜 만들기 때문에 상행·하행이 별개 링크다.
 * 방향을 모르면 하행 CCTV가 상행 링크에 매핑되므로, 공간 매칭의 전제 조건이다.
 */

const ARROWS = ["↑", "↓", "→", "←"];

export interface ParsedDirection {
  direction: CctvDirection;
  /** "순천방향" → "순천" */
  target: string | null;
}

/** "○○방향" 표기에서 대상지명을 뽑는다. 최대 6자까지만 본다(계획서 스크립트 기준). */
const TOWARD_PATTERN = /(\S{1,6})방향/;

export function parseCctvDirection(rawName: string | null | undefined): ParsedDirection {
  const name = (rawName ?? "").trim();
  if (!name) return { direction: "미상", target: null };

  // 상행/하행이 가장 명확한 신호다
  if (name.includes("상행")) return { direction: "상행", target: null };
  if (name.includes("하행")) return { direction: "하행", target: null };

  const toward = name.match(TOWARD_PATTERN);
  if (toward) {
    // "양방향"은 방향이 아니라 양쪽 모두를 뜻하므로 지정으로 보지 않는다
    const target = toward[1];
    if (target === "양") return { direction: "미상", target: null };
    return { direction: "방향지정", target };
  }

  if (ARROWS.some((arrow) => name.includes(arrow))) {
    return { direction: "방향지정", target: null };
  }

  return { direction: "미상", target: null };
}

/** 명칭에 방향 정보가 조금이라도 있는지 (집계용) */
export function hasDirectionHint(rawName: string | null | undefined): boolean {
  const name = (rawName ?? "").trim();
  if (!name) return false;
  if (name.includes("상행") || name.includes("하행")) return true;
  if (TOWARD_PATTERN.test(name)) return true;
  return ARROWS.some((arrow) => name.includes(arrow));
}
