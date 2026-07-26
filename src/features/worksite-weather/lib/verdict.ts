import {
  COLD_THRESHOLDS,
  ELEVATED_WIND_ESCALATE_FROM,
  HEAT_THRESHOLDS,
  PEAK_HEAT_HOURS,
  RAIN_THRESHOLDS,
  WIND_THRESHOLDS,
} from "@/features/worksite-weather/constants/thresholds";
import { round1 } from "@/features/worksite-weather/lib/apparent-temp";
import {
  VERDICT_RANK,
  type HazardSummary,
  type RecommendedWindow,
  type Verdict,
  type WeatherSlot,
  type WorkType,
} from "@/features/worksite-weather/types/weather";

/** 위험도가 더 높은 쪽을 고른다. unknown은 실제 등급을 덮지 않는다. */
export function worstVerdict(a: Verdict, b: Verdict): Verdict {
  if (a === "unknown") return b;
  if (b === "unknown") return a;
  return VERDICT_RANK[a] >= VERDICT_RANK[b] ? a : b;
}

const ESCALATION: Record<Verdict, Verdict> = {
  unknown: "unknown",
  safe: "caution",
  caution: "warning",
  warning: "danger",
  danger: "stop",
  stop: "stop",
};

/** 폭염 — 산업안전보건법 기준. 체감온도 기반. */
export function heatVerdict(apparent: number | null): Verdict {
  if (apparent === null) return "unknown";
  if (apparent >= HEAT_THRESHOLDS.stop) return "stop";
  if (apparent >= HEAT_THRESHOLDS.danger) return "danger";
  if (apparent >= HEAT_THRESHOLDS.warning) return "warning";
  if (apparent >= HEAT_THRESHOLDS.caution) return "caution";
  return "safe";
}

/** 한파 — 기상청 겨울철 체감온도 준용. 경계값은 더 엄격한 쪽에 붙인다. */
export function coldVerdict(apparent: number | null): Verdict {
  if (apparent === null) return "unknown";
  if (apparent <= COLD_THRESHOLDS.stop) return "stop";
  if (apparent <= COLD_THRESHOLDS.warning) return "warning";
  if (apparent < COLD_THRESHOLDS.caution) return "caution";
  return "safe";
}

/**
 * 강풍 — 안전보건규칙 제383조 준용(10m/s).
 * 고소 작업(elevated)은 한 단계 올리되, 무풍 구간까지 경보를 띄우지는 않는다.
 */
export function windVerdict(windMs: number | null, workType: WorkType): Verdict {
  if (windMs === null) return "unknown";

  let verdict: Verdict = "safe";
  if (windMs >= WIND_THRESHOLDS.stop) verdict = "stop";
  else if (windMs >= WIND_THRESHOLDS.warning) verdict = "warning";
  else if (windMs >= WIND_THRESHOLDS.caution) verdict = "caution";

  if (workType === "elevated" && windMs >= ELEVATED_WIND_ESCALATE_FROM) {
    verdict = ESCALATION[verdict];
  }
  return verdict;
}

export interface RainInput {
  pop: number | null;
  pcp: number;
  sno: number;
  isSnow: boolean;
}

/** 강수 — 제383조(1mm/1cm) + 강수확률 자체 기준 */
export function rainVerdict(input: RainInput): Verdict {
  if (input.pcp >= RAIN_THRESHOLDS.pcpStop) return "stop";
  if (input.sno >= RAIN_THRESHOLDS.snoStop) return "stop";

  let verdict: Verdict = "safe";
  if (input.pop !== null) {
    if (input.pop >= RAIN_THRESHOLDS.popWarning) verdict = "warning";
    else if (input.pop >= RAIN_THRESHOLDS.popCaution) verdict = "caution";
  }

  // 눈·진눈깨비는 노면 결빙 때문에 강수확률과 별개로 경고까지 올린다
  if (input.isSnow) verdict = worstVerdict(verdict, "warning");
  return verdict;
}

export interface SlotVerdictInput {
  time: string;
  apparent: number | null;
  temp: number | null;
  windSpeed: number | null;
  pop: number | null;
  pcp: number;
  pcpLabel: string;
  sno: number;
  snoLabel: string;
  isSnow: boolean;
  workType: WorkType;
}

export interface SlotVerdictResult {
  verdict: Verdict;
  reasons: string[];
}

/** 한 시간대의 4종 위험을 합산해 최종 판정과 사유를 만든다. */
export function evaluateSlot(input: SlotVerdictInput): SlotVerdictResult {
  const reasons: string[] = [];

  // 체감온도는 여름·겨울 중 한쪽만 의미가 있다. 기온으로 어느 쪽을 볼지 정한다.
  const heat = input.temp !== null && input.temp >= 20 ? heatVerdict(input.apparent) : "safe";
  const cold = input.temp !== null && input.temp <= 15 ? coldVerdict(input.apparent) : "safe";
  const wind = windVerdict(input.windSpeed, input.workType);
  const rain = rainVerdict({
    pop: input.pop,
    pcp: input.pcp,
    sno: input.sno,
    isSnow: input.isSnow,
  });

  if (heat !== "safe" && heat !== "unknown") {
    reasons.push(`체감온도 ${round1(input.apparent)}℃`);
  }
  if (cold !== "safe" && cold !== "unknown") {
    reasons.push(`체감온도 ${round1(input.apparent)}℃`);
  }
  if (wind !== "safe" && wind !== "unknown") {
    const suffix = input.workType === "elevated" ? " (고소작업 가중)" : "";
    reasons.push(`풍속 ${round1(input.windSpeed)}m/s${suffix}`);
  }
  if (input.pcp >= RAIN_THRESHOLDS.pcpStop) {
    reasons.push(`강수량 ${input.pcpLabel}`);
  } else if (rain !== "safe" && rain !== "unknown" && input.pop !== null) {
    reasons.push(`강수확률 ${input.pop}%`);
  }
  if (input.sno >= RAIN_THRESHOLDS.snoStop) {
    reasons.push(`신적설 ${input.snoLabel}`);
  }

  // 필수 항목이 전부 결측이면 추정하지 않고 판정 불가로 둔다
  const allUnknown =
    input.apparent === null && input.windSpeed === null && input.pop === null;
  if (allUnknown) return { verdict: "unknown", reasons: ["예보 결측"] };

  const verdict = [heat, cold, wind, rain].reduce<Verdict>(
    (acc, cur) => worstVerdict(acc, cur),
    "safe",
  );

  return { verdict, reasons };
}

/**
 * 발효 특보 1건 → 종합 판정에 반영할 등급.
 *
 * 특보를 종류 구분 없이 "경보=중지"로 처리하면 안 된다.
 * 여름철 전남권은 폭염경보가 상시 깔려 있어 모든 국소가 ⛔로 보이고, 그러면 아무도 안 믿는다.
 * CR-004 §2의 위험별 기준을 그대로 따른다.
 * - 호우·강풍·대설·태풍·한파: 특보 자체가 작업 중지 사유 (§2.2~2.5)
 * - 폭염: 중지 여부는 체감온도 판정이 주도하므로 특보는 한 단계 낮춰 반영 (§2.1)
 */
export function alertVerdict(type: string, level: string): Verdict {
  const isWarning = level.includes("경보"); // 경보 · 중대경보
  const stopTypes = ["호우", "강풍", "대설", "태풍", "한파", "폭풍해일"];

  if (stopTypes.some((keyword) => type.includes(keyword))) return "stop";

  if (type.includes("폭염")) return isWarning ? "danger" : "warning";
  // 열대야는 야간 현상이라 주간 작업 판정에 직접 적용하지 않고 주의로만 남긴다
  if (type.includes("열대야")) return "caution";

  // 건조·황사·풍랑 등 나머지는 참고 표시만 하고 등급을 올리지 않는다
  return "safe";
}

/** 발효 특보 전체 → 종합 판정에 더할 등급 */
export function alertsVerdict(
  alerts: ReadonlyArray<{ type: string; level: string }>,
): Verdict {
  return alerts.reduce<Verdict>(
    (acc, alert) => worstVerdict(acc, alertVerdict(alert.type, alert.level)),
    "safe",
  );
}

/** 타임라인 전체 → 종합 판정. 가장 위험한 시간대를 기준으로 삼는다. */
export function overallVerdict(slots: WeatherSlot[]): Verdict {
  const known = slots.filter((slot) => slot.verdict !== "unknown");
  if (known.length === 0) return "unknown";
  return known.reduce<Verdict>((acc, slot) => worstVerdict(acc, slot.verdict), "safe");
}

const hhmmToLabel = (hhmm: string): string => `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;

/**
 * 작업 권장 시간대.
 * 아직 지나지 않았고 '주의' 이하인 슬롯이 연속된 구간을 모두 뽑는다.
 * 오전·늦은 오후로 갈라지는 경우가 흔해 배열로 반환한다.
 */
export function findRecommendedWindows(
  slots: WeatherSlot[],
  nowHhmm: string,
): RecommendedWindow[] {
  const windows: RecommendedWindow[] = [];
  let start: WeatherSlot | null = null;
  let last: WeatherSlot | null = null;

  const flush = (): void => {
    if (!start || !last) return;
    windows.push({
      from: hhmmToLabel(start.time),
      to: hhmmToLabel(last.time),
      note: start === last ? "1시간 구간" : "",
    });
    start = null;
    last = null;
  };

  for (const slot of slots) {
    const isFuture = slot.time >= nowHhmm;
    const isWorkable = slot.verdict === "safe" || slot.verdict === "caution";

    if (isFuture && isWorkable) {
      if (!start) start = slot;
      last = slot;
    } else {
      flush();
    }
  }
  flush();

  return windows;
}

/** 4종 위험별 최댓값·시각·등급 요약 */
export function buildHazardSummary(slots: WeatherSlot[], workType: WorkType): HazardSummary {
  const summary: HazardSummary = {
    heat: { level: "none", peak: null, peakTime: null, note: "" },
    cold: { level: "none", peak: null, peakTime: null, note: "" },
    wind: { level: "none", peak: null, peakTime: null, note: "" },
    rain: { level: "none", peak: null, peakTime: null, note: "" },
  };

  for (const slot of slots) {
    if (slot.apparent !== null && slot.temp !== null) {
      if (slot.temp >= 20) {
        const level = heatVerdict(slot.apparent);
        if (level !== "safe" && level !== "unknown") {
          if (summary.heat.peak === null || slot.apparent > summary.heat.peak) {
            summary.heat.peak = round1(slot.apparent);
            summary.heat.peakTime = hhmmToLabel(slot.time);
          }
          summary.heat.level = worstVerdict(
            summary.heat.level === "none" ? "safe" : summary.heat.level,
            level,
          );
        }
      }
      if (slot.temp <= 15) {
        const level = coldVerdict(slot.apparent);
        if (level !== "safe" && level !== "unknown") {
          if (summary.cold.peak === null || slot.apparent < summary.cold.peak) {
            summary.cold.peak = round1(slot.apparent);
            summary.cold.peakTime = hhmmToLabel(slot.time);
          }
          summary.cold.level = worstVerdict(
            summary.cold.level === "none" ? "safe" : summary.cold.level,
            level,
          );
        }
      }
    }

    if (slot.windSpeed !== null) {
      const level = windVerdict(slot.windSpeed, workType);
      if (level !== "safe" && level !== "unknown") {
        if (summary.wind.peak === null || slot.windSpeed > summary.wind.peak) {
          summary.wind.peak = round1(slot.windSpeed);
          summary.wind.peakTime = hhmmToLabel(slot.time);
        }
        summary.wind.level = worstVerdict(
          summary.wind.level === "none" ? "safe" : summary.wind.level,
          level,
        );
      }
    }

    const rainLevel = rainVerdict({
      pop: slot.pop,
      pcp: slot.pcp,
      sno: slot.sno,
      isSnow: slot.pty.includes("눈"),
    });
    if (rainLevel !== "safe" && rainLevel !== "unknown") {
      const metric = slot.pcp > 0 ? slot.pcp : (slot.pop ?? 0);
      if (summary.rain.peak === null || metric > summary.rain.peak) {
        summary.rain.peak = metric;
        summary.rain.peakTime = hhmmToLabel(slot.time);
      }
      summary.rain.level = worstVerdict(
        summary.rain.level === "none" ? "safe" : summary.rain.level,
        rainLevel,
      );
    }
  }

  summary.heat.note = buildHeatNote(summary.heat.level, slots);
  summary.cold.note = summary.cold.level === "none" ? "해당 없음" : "방한장구·온열 휴식 공간 확보";
  summary.wind.note =
    summary.wind.level === "stop"
      ? "10m/s 초과 — 옥상·철탑 작업 중지 (안전보건규칙 제383조)"
      : summary.wind.level === "none"
        ? "해당 없음"
        : "적재물 결박·함체 도어 고정 확인";
  summary.rain.note =
    summary.rain.level === "stop"
      ? "1mm/h 초과 — 고소작업 중지, 지상작업 시 절연장갑"
      : summary.rain.level === "none"
        ? "해당 없음"
        : "방수 커버·미끄럼 방지화 준비";

  return summary;
}

function buildHeatNote(level: Verdict | "none", slots: WeatherSlot[]): string {
  if (level === "none") return "해당 없음";

  const peakHourRisky = slots.some(
    (slot) =>
      (PEAK_HEAT_HOURS as readonly string[]).includes(slot.time) &&
      VERDICT_RANK[slot.verdict] >= VERDICT_RANK.danger,
  );
  if (peakHourRisky) {
    return "14~17시 옥외작업 중지, 담당자 지정 후 건강상태 확인";
  }
  if (level === "warning") return "2시간마다 20분 이상 휴식 부여";
  return "2시간 이상 연속 작업 시 휴식·작업시간대 조정";
}
