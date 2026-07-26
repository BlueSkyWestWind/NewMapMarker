/**
 * 기상특보 조회 관서(stnId) 매핑.
 *
 * getWthrWrnList는 특보구역코드를 입력으로 받지 않고 관서 단위 목록만 반환한다.
 * 따라서 stnId로 목록을 받은 뒤 본문 텍스트에서 시·군·구명을 매칭해야 한다. (CR-004 §9)
 */

/** 광주지방기상청 — 광주·전남 관할. 본 서비스 주 사용 권역 */
export const DEFAULT_WARN_STN_ID = 156;

/** 시·도 접두어 → 관서 stnId. 주소 앞부분으로 판정한다. */
const STN_BY_REGION_PREFIX: ReadonlyArray<{ prefixes: string[]; stnId: number }> = [
  { prefixes: ["광주", "전남", "전라남도"], stnId: 156 },
  { prefixes: ["전북", "전라북도"], stnId: 146 },
  { prefixes: ["서울", "인천", "경기"], stnId: 109 },
  { prefixes: ["부산", "울산", "경남", "경상남도"], stnId: 159 },
  { prefixes: ["대구", "경북", "경상북도"], stnId: 143 },
  { prefixes: ["대전", "세종", "충남", "충청남도"], stnId: 133 },
  { prefixes: ["충북", "충청북도"], stnId: 131 },
  { prefixes: ["강원"], stnId: 105 },
  { prefixes: ["제주"], stnId: 184 },
];

/**
 * 주소 문자열 → 특보 조회 관서 stnId.
 * 매칭 실패 시 주 사용 권역인 광주(156)로 떨어뜨린다.
 */
export function resolveWarnStnId(address: string | null | undefined): number {
  const head = (address ?? "").trim().slice(0, 12);
  if (!head) return DEFAULT_WARN_STN_ID;

  for (const entry of STN_BY_REGION_PREFIX) {
    if (entry.prefixes.some((prefix) => head.startsWith(prefix))) {
      return entry.stnId;
    }
  }
  return DEFAULT_WARN_STN_ID;
}

/**
 * 특보 본문에서 찾을 위험 종류.
 * 기상청 특보 제목은 "폭염경보", "호우주의보" 같은 형태의 자유 서술 텍스트다.
 */
export const WARN_KEYWORDS = ["폭염", "호우", "한파", "강풍", "대설", "태풍", "풍랑"] as const;

export type WarnKeyword = (typeof WARN_KEYWORDS)[number];

/** 참조용 — 격자·특보구역 대조표 (CR-004 §9에서 실검증) */
export const REFERENCE_GRIDS = [
  { name: "광주광역시", nx: 58, ny: 74, zoneCode: "11F20801" },
  { name: "전남 목포시", nx: 50, ny: 67, zoneCode: "11F20503" },
  { name: "전남 여수시", nx: 73, ny: 66, zoneCode: "11F20401" },
  { name: "전남 순천시", nx: 70, ny: 70, zoneCode: "11F20402" },
] as const;
