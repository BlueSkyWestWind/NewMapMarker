/**
 * 일정 칸에 국소명을 넣을 때 쓰는 국소 검색(순수 함수).
 * 원본은 장비 마커의 국소명·통합시설코드·프로젝트코드·주소·별칭이다. 공백과 대소문자는 무시한다.
 */

export interface StationSource {
  id: string;
  name: string;
  finalStationName?: string | null;
  roadAddress?: string | null;
  jibunAddress?: string | null;
  /** 현장 호칭이 제각각이라 쉼표로 여러 개 등록한 별칭 */
  siteAlias?: string | null;
  /** 통합시설코드(대표 정보 행) */
  facilityCode?: string | null;
  /** 프로젝트코드(대표 정보 행) */
  projectCode?: string | null;
}

export interface StationOption {
  /** 칸에 넣을 국소명 */
  label: string;
  address: string;
  /** 통합시설코드(없으면 빈 글) */
  facilityCode: string;
  /** 프로젝트코드(없으면 빈 글) */
  projectCode: string;
  /** 두 코드를 정규화한 검색용 글 */
  codes: string[];
  /** 주소·별칭을 합쳐 정규화한 검색용 글 */
  keywords: string;
}

const DEFAULT_LIMIT = 8;

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

/** 마커 목록에서 검색 후보를 만든다. 같은 국소명은 하나만 남기고 이름이 빈 마커는 뺀다. */
export function buildStationOptions(markers: StationSource[]): StationOption[] {
  const seen = new Set<string>();
  const options: StationOption[] = [];
  for (const marker of markers) {
    const label = (marker.finalStationName || marker.name || "").trim();
    if (label === "" || seen.has(label)) continue;
    seen.add(label);
    const address = (marker.roadAddress || marker.jibunAddress || "").trim();
    const facilityCode = (marker.facilityCode ?? "").trim();
    const projectCode = (marker.projectCode ?? "").trim();
    options.push({
      label,
      address,
      facilityCode,
      projectCode,
      codes: [facilityCode, projectCode].map(normalize).filter(Boolean),
      keywords: normalize([address, marker.siteAlias ?? ""].join(" ")),
    });
  }
  return options;
}

/**
 * 국소명이 검색어로 시작하는 후보를 먼저, 국소명에 포함하는 후보, 통합시설코드·프로젝트코드가 일치하는 후보,
 * 주소·별칭이 일치하는 후보 순으로 최대 `limit`개 준다. 검색어가 비면 빈 배열이다.
 */
export function searchStations(
  options: StationOption[],
  query: string,
  limit: number = DEFAULT_LIMIT,
): StationOption[] {
  const needle = normalize(query);
  if (needle === "") return [];

  const startsWith: StationOption[] = [];
  const includes: StationOption[] = [];
  const byCode: StationOption[] = [];
  const byKeyword: StationOption[] = [];
  for (const option of options) {
    const label = normalize(option.label);
    if (label.startsWith(needle)) startsWith.push(option);
    else if (label.includes(needle)) includes.push(option);
    else if (option.codes.some((code) => code.includes(needle))) byCode.push(option);
    else if (option.keywords.includes(needle)) byKeyword.push(option);
  }
  return [...startsWith, ...includes, ...byCode, ...byKeyword].slice(0, limit);
}
