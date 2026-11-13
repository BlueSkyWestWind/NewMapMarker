import type { DataSource, WeatherDataInfo } from "@/features/worksite-weather/types/weather";

/** 실황 기준이 이 시간 이상 오래되면 "N시간 전 자료"로 경고한다 */
const STALE_HOURS = 3;
const HOUR_MS = 60 * 60 * 1000;

const SOURCE_LABEL: Record<DataSource, string> = {
  auto: "자동",
  manual: "수동",
  screen: "화면 조회",
};

export interface DataInfoLabel {
  text: string;
  isStale: boolean;
  isMissing: boolean;
}

/** KST offset이 붙은 ISO의 `HH:mm` */
function kstHhmm(iso: string): string {
  return iso.slice(11, 16);
}

/** UTC ISO(`Z`)를 KST `HH:mm`으로 */
function utcToKstHhmm(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * HOUR_MS);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * 국소 아래에 보여 줄 "어떤 시각의 자료인가" 문구.
 * 기준은 실황(관측) 기준시각이고, 실황이 없으면 단기예보 기준시각을 쓴다.
 */
export function formatDataInfoLabel(info: WeatherDataInfo, now: Date): DataInfoLabel {
  if (info.missing.includes("vilage")) {
    return { text: "저장된 자료 없음", isStale: false, isMissing: true };
  }

  const baseIso = info.bases.ncst ?? info.bases.vilage;
  const parts: string[] = [];
  if (baseIso) parts.push(`기준 ${kstHhmm(baseIso)}`);
  if (info.collectedAt) {
    const source = info.collectedBy ? ` ${SOURCE_LABEL[info.collectedBy]}` : "";
    parts.push(`수집 ${utcToKstHhmm(info.collectedAt)}${source}`);
  }

  let isStale = false;
  if (info.bases.ncst) {
    const hours = Math.floor((now.getTime() - Date.parse(info.bases.ncst)) / HOUR_MS);
    if (hours >= STALE_HOURS) {
      isStale = true;
      parts.push(`${hours}시간 전 자료`);
    }
  }

  return { text: parts.join(" · "), isStale, isMissing: false };
}
