import {
  SLOT_SOURCE_LABEL,
  VERDICT_LABEL,
  type SiteMatch,
  type WorksiteWeatherResponse,
} from "@/features/worksite-weather/types/weather";

type Row = Array<string | number>;

const HAZARD_LABEL: Record<string, string> = {
  heat: "폭염",
  wind: "강풍",
  rain: "강수",
  cold: "한파",
};

function buildRows(site: SiteMatch, data: WorksiteWeatherResponse): Row[] {
  const rows: Row[] = [
    ["국소 작업 안전 날씨 (TBM 자료)"],
    [],
    ["국소명", site.name],
    ["주소", site.address || "-"],
    ["작업 형태", site.workType === "elevated" ? "옥상·철탑(고소)" : "지상"],
    ["조회 일자", data.date],
    ["예보 발표", data.issuedAt],
    ["종합 판정", VERDICT_LABEL[data.overall]],
    [
      "권장 시간대",
      data.recommendedWindows.length === 0
        ? "없음"
        : data.recommendedWindows.map((w) => `${w.from}~${w.to}`).join(", "),
    ],
    [],
    ["시각", "기온(℃)", "체감(℃)", "습도(%)", "풍향", "풍속(m/s)", "강수확률(%)", "강수량", "하늘", "판정", "사유", "출처"],
  ];

  for (const slot of data.timeline) {
    rows.push([
      `${slot.time.slice(0, 2)}시`,
      slot.temp ?? "-",
      slot.apparent ?? "-",
      slot.humidity ?? "-",
      slot.windDir,
      slot.windSpeed ?? "-",
      slot.pop ?? "-",
      slot.pcpLabel,
      slot.sky,
      VERDICT_LABEL[slot.verdict],
      slot.reasons.join(" / "),
      SLOT_SOURCE_LABEL[slot.source],
    ]);
  }

  rows.push([], ["위험 요약"]);
  for (const [kind, entry] of Object.entries(data.hazardSummary)) {
    rows.push([
      HAZARD_LABEL[kind] ?? kind,
      entry.level === "none" ? "해당 없음" : VERDICT_LABEL[entry.level],
      entry.peak === null ? "" : String(entry.peak),
      entry.peakTime ?? "",
      entry.note,
    ]);
  }

  if (data.alerts.length > 0) {
    rows.push([], ["발효 특보"]);
    for (const alert of data.alerts) {
      rows.push([alert.type, alert.level, alert.region, alert.issuedAt]);
    }
  }

  if (data.typhoon) {
    rows.push([], ["태풍", `태풍${data.typhoon.alertLevel} 발효 — 작업 연기 권고`]);
  }

  if (data.warnings.length > 0) {
    rows.push([], ["주의"]);
    for (const warning of data.warnings) rows.push([warning]);
  }

  // 법정 기준 고지는 화면과 저장 자료 양쪽에 반드시 남긴다 (CR-004 §2.1)
  rows.push([], [data.disclaimer]);

  return rows;
}

/**
 * TBM 배포용 엑셀 저장.
 *
 * xlsx(SheetJS)는 1MB가 넘는다. 정적 import하면 사이드바 패널을 통해
 * 홈 첫 로딩 번들에 통째로 실리므로, 저장 버튼을 누른 순간에만 내려받는다.
 */
export async function exportTbmWorkbook(
  site: SiteMatch,
  data: WorksiteWeatherResponse,
): Promise<void> {
  const XLSX = await import("xlsx");

  const sheet = XLSX.utils.aoa_to_sheet(buildRows(site, data));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "작업안전날씨");

  const safeName = (site.name || "국소").replace(/[\\/:*?"<>|]/g, "_");
  XLSX.writeFile(book, `TBM_작업안전날씨_${safeName}_${data.date}.xlsx`);
}
