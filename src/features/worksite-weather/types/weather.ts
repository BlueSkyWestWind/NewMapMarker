/** 작업 형태. elevated(옥상·철탑)는 강풍 판정을 한 단계 엄격하게 적용한다. */
export type WorkType = "ground" | "elevated";

/**
 * 시간대 판정 등급. 위험도 오름차순이며 `VERDICT_RANK`로 비교한다.
 * `unknown`은 결측 슬롯 — 임의 추정값을 채우지 않는다는 뜻이므로 다른 등급과 섞어 최댓값을 내지 않는다.
 */
export type Verdict = "safe" | "caution" | "warning" | "danger" | "stop" | "unknown";

export const VERDICT_RANK: Record<Verdict, number> = {
  unknown: -1,
  safe: 0,
  caution: 1,
  warning: 2,
  danger: 3,
  stop: 4,
};

export const VERDICT_ICON: Record<Verdict, string> = {
  unknown: "—",
  safe: "🟢",
  caution: "🟡",
  warning: "🟠",
  danger: "🔴",
  stop: "⛔",
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  unknown: "판정 불가",
  safe: "양호",
  caution: "주의",
  warning: "경고",
  danger: "위험",
  stop: "중지",
};

/**
 * 판정 등급별 배경/테두리 색. 지도 오버레이와 사이드바가 같은 톤을 쓰도록 여기서만 정의한다.
 * 등급 표기가 화면마다 갈리면 현장에서 위험도를 오판한다.
 */
export const VERDICT_TONE: Record<Verdict, string> = {
  unknown: "bg-slate-800 border-slate-700 text-slate-200",
  safe: "bg-emerald-950/80 border-emerald-800/60 text-emerald-200",
  caution: "bg-amber-950/80 border-amber-800/60 text-amber-200",
  warning: "bg-orange-950/80 border-orange-800/60 text-orange-200",
  danger: "bg-rose-950/80 border-rose-800/60 text-rose-200",
  stop: "bg-red-950 border-red-800 text-red-100",
};

/**
 * 종합 판정 배너용 톤. 테두리를 강조한다는 점만 `VERDICT_TONE`과 다르고 등급 의미는 같다.
 * 배너를 그리는 화면이 둘 이상(사이드바 패널·대시보드)이라 여기서만 정의한다.
 */
export const OVERALL_TONE: Record<Verdict, string> = {
  unknown: "border-slate-700 bg-slate-900/60 text-slate-300",
  safe: "border-emerald-600/50 bg-emerald-950/40 text-emerald-200",
  caution: "border-amber-600/50 bg-amber-950/40 text-amber-200",
  warning: "border-orange-600/50 bg-orange-950/40 text-orange-200",
  danger: "border-rose-600/50 bg-rose-950/40 text-rose-200",
  stop: "border-rose-500 bg-rose-950/70 text-rose-100",
};

/** 슬롯 데이터의 출처. 신뢰도 차이를 화면 배지로 노출한다. */
export type SlotSource = "past" | "ncst" | "ultra" | "vilage" | "missing";

export const SLOT_SOURCE_LABEL: Record<SlotSource, string> = {
  past: "경과",
  ncst: "실황",
  ultra: "정밀",
  vilage: "예보",
  missing: "결측",
};

export interface WeatherSlot {
  /** "0700" 형식 */
  time: string;
  source: SlotSource;
  temp: number | null;
  apparent: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windDeg: number | null;
  windDir: string;
  windLabel: string;
  /** 강수확률(%) — 초단기 소스에는 없으므로 null 가능 */
  pop: number | null;
  /** 강수형태 텍스트 */
  pty: string;
  /** 판정에 쓴 1시간 강수량 상한(mm) */
  pcp: number;
  /** 기상청 원문 (예: "1.0mm 미만") */
  pcpLabel: string;
  /** 판정에 쓴 1시간 신적설 상한(cm) */
  sno: number;
  snoLabel: string;
  sky: string;
  verdict: Verdict;
  reasons: string[];
}

export type HazardKind = "heat" | "cold" | "wind" | "rain";

export interface HazardSummaryEntry {
  level: Verdict | "none";
  /** 최댓값(폭염·강풍) 또는 최솟값(한파). 해당 없음이면 null */
  peak: number | null;
  peakTime: string | null;
  note: string;
}

export type HazardSummary = Record<HazardKind, HazardSummaryEntry>;

export interface RecommendedWindow {
  /** "07:00" 형식 */
  from: string;
  to: string;
  note: string;
}

export interface WeatherAlert {
  /** 폭염 · 호우 · 강풍 등 */
  type: string;
  /** 주의보 · 경보 */
  level: string;
  region: string;
  issuedAt: string;
}

/**
 * 태풍 진로 상세. 기상청 태풍정보 조회서비스 연동 시에만 채워진다.
 * 활용신청 전에는 특보만으로 판단하므로 null이다.
 */
export interface TyphoonDetail {
  name: string;
  number: string;
  position: string;
  pressureHpa: number | null;
  maxWindMs: number | null;
  forecast: string;
}

export interface TyphoonInfo {
  /** 주의보 | 경보 */
  alertLevel: string;
  region: string;
  issuedAt: string;
  detail: TyphoonDetail | null;
}

export interface WorksiteWeatherSite {
  lat: number;
  lng: number;
  grid: { nx: number; ny: number };
  workType: WorkType;
}

export interface WorksiteWeatherResponse {
  site: WorksiteWeatherSite;
  /** "YYYY-MM-DD" (KST) */
  date: string;
  /** 단기예보 발표 기준시각 ISO(KST offset) */
  issuedAt: string;
  overall: Verdict;
  recommendedWindows: RecommendedWindow[];
  timeline: WeatherSlot[];
  hazardSummary: HazardSummary;
  alerts: WeatherAlert[];
  /** null이면 프론트엔드는 태풍 영역을 렌더링하지 않는다 */
  typhoon: TyphoonInfo | null;
  /** 특보 본문 파싱에 실패했거나 일부 소스가 누락된 경우의 경고 문구 */
  warnings: string[];
  disclaimer: string;
}

/** 국소 검색 결과 — 좌표 해석은 클라이언트 책임 (CR-004 §5.1) */
export type SiteMatchKind = "name" | "alias" | "address" | "geocode" | "manual";

export interface SiteMatch {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  workType: WorkType;
  matchedBy: SiteMatchKind;
}
