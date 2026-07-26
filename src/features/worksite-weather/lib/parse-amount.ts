export interface AmountRange {
  /** 판정에 쓰는 상한값(안전측). "강수없음" = 0 */
  max: number;
  /** 화면에 그대로 노출할 기상청 원문 */
  label: string;
}

/** "미만"은 임계값에 걸리지 않아야 하므로 상한에서 이만큼 뺀다. */
const BELOW_EPSILON = 0.01;

/**
 * PCP(1시간 강수량) / SNO(1시간 신적설) 문자열 → 판정용 상한값.
 *
 * 기상청은 수치가 아니라 "강수없음" / "1.0mm 미만" / "1.0~29.9mm" / "50.0mm 이상"
 * 같은 문자열을 준다. `Number()`를 그대로 쓰면 NaN이 되어 판정이 통째로 무너진다.
 *
 * 범위값은 **상한**을 채택한다. 안전 판정이므로 낮은 쪽을 고르면 위험을 과소평가한다.
 * (원본 계획서의 "미만 → 절반" 환산은 이 방향이 반대여서 폐기했다. CR-004 §4.3)
 */
export function parseAmount(raw: string | number | null | undefined): AmountRange {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { max: raw, label: String(raw) } : { max: 0, label: "없음" };
  }

  const label = (raw ?? "").trim();
  if (!label || label.includes("없음")) return { max: 0, label: "없음" };

  const nums = (label.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (nums.length === 0) return { max: 0, label };

  if (label.includes("미만")) {
    return { max: Math.max(0, nums[0] - BELOW_EPSILON), label };
  }

  // "1.0~29.9mm"는 상한, "50.0mm 이상"은 하한이 곧 최소 보장치
  return { max: Math.max(...nums), label };
}

const PTY_TEXT: Record<string, string> = {
  "0": "없음",
  "1": "비",
  "2": "비/눈",
  "3": "눈",
  "4": "소나기",
  "5": "빗방울",
  "6": "빗방울눈날림",
  "7": "눈날림",
};

export function ptyText(code: string | null | undefined): string {
  return PTY_TEXT[String(code ?? "").trim()] ?? "없음";
}

/** 눈·진눈깨비 계열인지 — 노면 결빙 경고 분기에 쓴다. */
export function isSnowLike(code: string | null | undefined): boolean {
  return ["2", "3", "6", "7"].includes(String(code ?? "").trim());
}

const SKY_TEXT: Record<string, string> = {
  "1": "맑음",
  "3": "구름많음",
  "4": "흐림",
};

export function skyText(code: string | null | undefined): string {
  return SKY_TEXT[String(code ?? "").trim()] ?? "-";
}

/** 문자열 수치 → number. 파싱 불가면 null (임의 추정값을 만들지 않는다). */
export function toNumberOrNull(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : null;
}
