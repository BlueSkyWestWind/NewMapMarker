import { describe, expect, it } from "vitest";
import { WORK_HOURS } from "@/features/worksite-weather/constants/thresholds";
import {
  buildTimeline,
  collectForecastSlots,
  collectObservation,
  countMissingSlots,
  type KmaItem,
} from "./merge-sources";

const TODAY = "20260726";

function vilageItem(time: string, category: string, value: string): KmaItem {
  return { category, fcstDate: TODAY, fcstTime: time, fcstValue: value };
}

/** 11슬롯 전체를 채운 단기예보 응답 */
function fullVilageItems(): KmaItem[] {
  const items: KmaItem[] = [];
  for (const time of WORK_HOURS) {
    items.push(
      vilageItem(time, "TMP", "28"),
      vilageItem(time, "REH", "70"),
      vilageItem(time, "WSD", "2.0"),
      vilageItem(time, "VEC", "180"),
      vilageItem(time, "POP", "10"),
      vilageItem(time, "PTY", "0"),
      vilageItem(time, "PCP", "강수없음"),
      vilageItem(time, "SNO", "적설없음"),
      vilageItem(time, "SKY", "1"),
    );
  }
  return items;
}

describe("collectForecastSlots", () => {
  it("07~17시 · 필요 카테고리만 남긴다", () => {
    const items: KmaItem[] = [
      vilageItem("0600", "TMP", "24"), // 범위 밖
      vilageItem("0700", "TMP", "26"),
      vilageItem("0700", "UUU", "9"), // 불필요 카테고리
      vilageItem("1800", "TMP", "29"), // 범위 밖
      { category: "TMP", fcstDate: "20260727", fcstTime: "0700", fcstValue: "30" }, // 다른 날
    ];
    const slots = collectForecastSlots(items, TODAY);

    expect(Object.keys(slots)).toEqual(["0700"]);
    expect(slots["0700"]).toEqual({ TMP: "26" });
  });

  it("응답이 없으면 빈 맵", () => {
    expect(collectForecastSlots(null, TODAY)).toEqual({});
    expect(collectForecastSlots(undefined, TODAY)).toEqual({});
  });
});

describe("collectObservation", () => {
  it("obsrValue를 읽는다", () => {
    const map = collectObservation([
      { category: "T1H", obsrValue: "31.4" },
      { category: "REH", obsrValue: "68" },
      { category: "XXX", obsrValue: "1" },
    ]);
    expect(map).toEqual({ T1H: "31.4", REH: "68" });
  });
});

describe("buildTimeline", () => {
  const baseInput = {
    targetDate: TODAY,
    vilage: collectForecastSlots(fullVilageItems(), TODAY),
    ultra: {},
    observation: {},
    observationTime: "",
    nowHhmm: "0700",
    workType: "ground" as const,
  };

  it("조회 시각과 무관하게 11슬롯을 모두 낸다", () => {
    expect(buildTimeline(baseInput)).toHaveLength(11);
    expect(buildTimeline({ ...baseInput, nowHhmm: "1600" })).toHaveLength(11);
    expect(buildTimeline(baseInput).map((s) => s.time)).toEqual([...WORK_HOURS]);
  });

  it("경과 시간대는 past로 표시한다", () => {
    const timeline = buildTimeline({ ...baseInput, nowHhmm: "1237" });
    const byTime = Object.fromEntries(timeline.map((s) => [s.time, s.source]));

    expect(byTime["0700"]).toBe("past");
    expect(byTime["1100"]).toBe("past");
    expect(byTime["1200"]).toBe("vilage"); // 현재 시각 슬롯은 경과가 아니다
    expect(byTime["1500"]).toBe("vilage");
  });

  it("소스 우선순위 — 실황 > 초단기 > 단기", () => {
    const timeline = buildTimeline({
      ...baseInput,
      nowHhmm: "1310",
      ultra: collectForecastSlots(
        [
          { category: "T1H", fcstDate: TODAY, fcstTime: "1400", fcstValue: "33" },
          { category: "REH", fcstDate: TODAY, fcstTime: "1400", fcstValue: "60" },
          { category: "WSD", fcstDate: TODAY, fcstTime: "1400", fcstValue: "3.0" },
        ],
        TODAY,
      ),
      observation: collectObservation([
        { category: "T1H", obsrValue: "31.4" },
        { category: "REH", obsrValue: "68" },
        { category: "WSD", obsrValue: "2.1" },
      ]),
      observationTime: "1300",
    });
    const byTime = Object.fromEntries(timeline.map((s) => [s.time, s]));

    expect(byTime["1300"].source).toBe("ncst");
    expect(byTime["1300"].temp).toBe(31.4);
    expect(byTime["1400"].source).toBe("ultra");
    expect(byTime["1400"].temp).toBe(33);
    expect(byTime["1500"].source).toBe("vilage");
    expect(byTime["1500"].temp).toBe(28);
  });

  it("초단기 오버레이가 POP을 지우지 않는다 (초단기에는 POP이 없다)", () => {
    const timeline = buildTimeline({
      ...baseInput,
      ultra: collectForecastSlots(
        [{ category: "T1H", fcstDate: TODAY, fcstTime: "0900", fcstValue: "30" }],
        TODAY,
      ),
    });
    const slot = timeline.find((s) => s.time === "0900");

    expect(slot?.temp).toBe(30); // 초단기 값으로 교체
    expect(slot?.pop).toBe(10); // 단기예보 값 유지
  });

  it("단기예보가 통째로 비면 전 슬롯이 missing/unknown", () => {
    const timeline = buildTimeline({ ...baseInput, vilage: {} });
    expect(timeline.every((s) => s.source === "missing")).toBe(true);
    expect(timeline.every((s) => s.verdict === "unknown")).toBe(true);
    expect(countMissingSlots(timeline)).toBe(11);
  });

  it("결측 슬롯은 추정값 없이 null을 유지한다", () => {
    const timeline = buildTimeline({ ...baseInput, vilage: {} });
    const slot = timeline[0];
    expect(slot.temp).toBeNull();
    expect(slot.apparent).toBeNull();
    expect(slot.windSpeed).toBeNull();
    expect(slot.pop).toBeNull();
  });

  it("PCP 문자열이 판정까지 이어진다", () => {
    const items = fullVilageItems().map((item) =>
      item.fcstTime === "1500" && item.category === "PCP"
        ? { ...item, fcstValue: "1.0~29.9mm" }
        : item,
    );
    const timeline = buildTimeline({
      ...baseInput,
      vilage: collectForecastSlots(items, TODAY),
    });
    const slot = timeline.find((s) => s.time === "1500");

    expect(slot?.pcp).toBe(29.9);
    expect(slot?.pcpLabel).toBe("1.0~29.9mm");
    expect(slot?.verdict).toBe("stop");
  });

  it("'1.0mm 미만'은 중지로 올라가지 않는다", () => {
    const items = fullVilageItems().map((item) =>
      item.fcstTime === "1500" && item.category === "PCP"
        ? { ...item, fcstValue: "1.0mm 미만" }
        : item,
    );
    const timeline = buildTimeline({
      ...baseInput,
      vilage: collectForecastSlots(items, TODAY),
    });
    expect(timeline.find((s) => s.time === "1500")?.verdict).not.toBe("stop");
  });

  it("고소 작업은 같은 풍속에서 더 엄격하게 판정한다", () => {
    const items = fullVilageItems().map((item) =>
      item.category === "WSD" ? { ...item, fcstValue: "8.0" } : item,
    );
    const vilage = collectForecastSlots(items, TODAY);

    const ground = buildTimeline({ ...baseInput, vilage, workType: "ground" });
    const elevated = buildTimeline({ ...baseInput, vilage, workType: "elevated" });

    expect(ground[0].verdict).toBe("warning");
    expect(elevated[0].verdict).toBe("danger");
  });
});
