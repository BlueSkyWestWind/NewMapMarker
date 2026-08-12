import type {
  BatteryMarker,
  EquipmentMarker,
} from "@/features/map-marker/types/marker";
import { GROUP_ROLE_SUB, normalizeGroupRole } from "@/features/map-marker/lib/address-group";
import type { SiteMatch, SiteMatchKind, WorkType } from "@/features/worksite-weather/types/weather";

/**
 * 검색 대상 국소의 공통 표현.
 * 장비(markers)와 축전지(battery_markers)는 주소·국소명 필드 이름이 달라 여기서 흡수한다.
 */
export interface SiteCandidate {
  id: string;
  name: string;
  address: string;
  /** 국소명 별칭 필드(장비: 최종국소명, 축전지: 스펙 국소명) */
  stationName: string;
  lat: number;
  lng: number;
  siteAlias: string | null;
  workType: string | null;
  groupRole?: string | null;
  parentMarkerId?: string | null;
}

export function batteryMarkerToCandidate(marker: BatteryMarker): SiteCandidate {
  return {
    id: marker.id,
    name: marker.name ?? "",
    address: marker.address ?? "",
    stationName: marker.stationName ?? "",
    lat: marker.lat,
    lng: marker.lng,
    siteAlias: marker.siteAlias ?? null,
    workType: marker.workType ?? null,
    groupRole: (marker as any).groupRole ?? null,
    parentMarkerId: (marker as any).parentMarkerId ?? null,
  };
}

export function equipmentMarkerToCandidate(marker: EquipmentMarker): SiteCandidate {
  return {
    id: marker.id,
    name: marker.name ?? "",
    // 장비는 도로명·지번을 따로 들고 있다. 표시는 도로명 우선.
    address: (marker.roadAddress || marker.jibunAddress) ?? "",
    stationName: marker.finalStationName ?? "",
    lat: marker.lat,
    lng: marker.lng,
    siteAlias: marker.siteAlias ?? null,
    workType: marker.workType ?? null,
    groupRole: marker.groupRole ?? null,
    parentMarkerId: marker.parentMarkerId ?? null,
  };
}

export function isSubCandidate(marker: SiteCandidate): boolean {
  if (marker.parentMarkerId && marker.parentMarkerId.trim() !== "") {
    return true;
  }
  return normalizeGroupRole(marker.groupRole) === GROUP_ROLE_SUB;
}

/** 공백·하이픈 차이로 검색이 실패하지 않게 정규화한다. */
export function normalize(value: string): string {
  return value.replace(/[\s-]+/g, "").toLowerCase();
}

/**
 * 주소 키워드가 마커 주소와 적합하게 일치하는지 엄격 검사한다.
 * 시/구 이름만 부분 일치해서 불필요한 마커가 무더기로 매칭되는 현상을 방지한다.
 */
function matchAddressTokens(address: string, rawQuery: string): { matches: boolean; score: number } {
  const normAddress = normalize(address);
  const needle = normalize(rawQuery);

  if (!normAddress || !needle) return { matches: false, score: 0 };

  // 1. 주소 전체 연속 부분 포함 (가장 일치도 높음)
  if (normAddress.includes(needle)) {
    return { matches: true, score: 70 };
  }

  const queryTokens = rawQuery.split(/\s+/).map(normalize).filter(Boolean);
  if (queryTokens.length === 0) return { matches: false, score: 0 };

  // 지번(숫자 포함) 및 동/가/길/로 토큰 추출
  const numberTokens = queryTokens.filter((t) => /\d/.test(t));
  const dongTokens = queryTokens.filter((t) => /[동가길로]$/.test(t.replace(/번지$/, "")));

  // 검색어에 지번(숫자) 토큰이 있는 경우, 마커 주소에 해당 지번 숫자가 없으면 매칭 실패!
  if (numberTokens.length > 0) {
    const hasNumberMatch = numberTokens.some((numTok) => {
      const cleanNum = numTok.replace(/번지$/, "");
      return normAddress.includes(cleanNum);
    });
    if (!hasNumberMatch) {
      return { matches: false, score: 0 };
    }
  }

  // 검색어에 동(동/가/길/로) 토큰이 있는 경우, 마커 주소에 해당 동 이름이 없으면 매칭 실패!
  if (dongTokens.length > 0) {
    const hasDongMatch = dongTokens.some((dongTok) => {
      const cleanDong = dongTok.replace(/번지$/, "");
      return normAddress.includes(cleanDong);
    });
    if (!hasDongMatch) {
      return { matches: false, score: 0 };
    }
  }

  // 매칭된 토큰 비율 검사
  let matchedCount = 0;
  for (const token of queryTokens) {
    const clean = token.replace(/번지$/, "");
    if (normAddress.includes(token) || (clean && normAddress.includes(clean))) {
      matchedCount++;
    }
  }

  const requiredCount = queryTokens.length <= 2 ? queryTokens.length : Math.ceil(queryTokens.length * 0.75);
  if (matchedCount >= requiredCount) {
    return { matches: true, score: 45 + matchedCount * 5 };
  }

  return { matches: false, score: 0 };
}

function parseAliases(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean);
}

export function parseWorkType(raw: string | null | undefined): WorkType {
  return raw === "elevated" ? "elevated" : "ground";
}

interface ScoredMatch extends SiteMatch {
  score: number;
}

/**
 * 국소 검색 — 이미 로드된 축전지 마커 스토어에서 찾는다.
 *
 * 서버 DB를 다시 조회하지 않는다. 마커 전량이 클라이언트에 이미 있고,
 * 지오코딩도 브라우저 SDK 전용이라 좌표 해석은 클라이언트가 끝내는 게 맞다. (CR-004 §5.1)
 */
export function searchSites(
  candidates: SiteCandidate[],
  query: string,
  limit = 8,
): SiteMatch[] {
  const needle = normalize(query);
  if (!needle) return [];

  const results: ScoredMatch[] = [];

  for (const marker of candidates) {
    // 좌표가 없는 국소는 기상 조회를 걸 수 없다 → 지오코딩 폴백으로 넘긴다
    if (!Number.isFinite(marker.lat) || !Number.isFinite(marker.lng)) continue;

    // SUB 국소는 제외한다 (대표, 단독 국소만 표시)
    if (isSubCandidate(marker)) continue;

    const name = normalize(marker.name ?? "");
    const address = normalize(marker.address ?? "");
    const station = normalize(marker.stationName ?? "");
    const aliases = parseAliases(marker.siteAlias).map(normalize);

    let score = 0;
    let matchedBy: SiteMatchKind = "name";

    if (name && name === needle) {
      score = 100;
    } else if (aliases.some((alias) => alias === needle)) {
      score = 95;
      matchedBy = "alias";
    } else if (name.startsWith(needle)) {
      score = 80;
    } else if (aliases.some((alias) => alias.startsWith(needle))) {
      score = 75;
      matchedBy = "alias";
    } else if (name.includes(needle)) {
      score = 60;
    } else if (station.includes(needle)) {
      score = 55;
    } else if (aliases.some((alias) => alias.includes(needle))) {
      score = 50;
      matchedBy = "alias";
    } else {
      const addrMatch = matchAddressTokens(marker.address ?? "", query);
      if (addrMatch.matches) {
        score = addrMatch.score;
        matchedBy = "address";
      }
    }

    if (score === 0) continue;

    results.push({
      id: marker.id,
      name: marker.name || marker.stationName || "(이름 없음)",
      address: marker.address ?? "",
      lat: marker.lat,
      lng: marker.lng,
      workType: parseWorkType(marker.workType),
      matchedBy,
      score,
    });
  }

  return results
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ko"))
    .slice(0, limit)
    .map(({ score: _score, ...match }) => match);
}

/**
 * 다중 검색 키워드 파싱.
 * 쉼표(,), 세미콜론(;), 줄바꿈(\n), 탭 및 "번지 " 경계로 분리한다.
 * 예: "광주 광산구 수완동 1768번지 광주 북구 오치동 957-12번지"
 * -> ["광주 광산구 수완동 1768번지", "광주 북구 오치동 957-12번지"]
 */
export function parseMultiKeywords(query: string): string[] {
  if (!query.trim()) return [];
  const rawParts = query.split(/[,;\n\t]+/);
  const keywords: string[] = [];

  for (const part of rawParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // "번지 " 패턴 뒤에 공백이 있고 추가 문자가 오면 쪼갠다
    const bundjiParts = trimmed
      .replace(/(\d+(?:-\d+)?번지)\s+/g, "$1\n")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    keywords.push(...bundjiParts);
  }

  return Array.from(new Set(keywords));
}

/**
 * 다중 키워드 국소 검색.
 * 여러 검색어(예: "강남, 서초, 역삼")를 입력받아 각 키워드별 검색 결과를 중복 없이 병합한다.
 */
export function searchSitesMulti(
  candidates: SiteCandidate[],
  query: string,
  limitPerKeyword = 20,
): SiteMatch[] {
  const keywords = parseMultiKeywords(query);
  if (keywords.length === 0) return [];

  // 키워드가 1개면 단일 검색
  if (keywords.length === 1) {
    return searchSites(candidates, keywords[0], 50);
  }

  const seenIds = new Set<string>();
  const combined: SiteMatch[] = [];

  for (const keyword of keywords) {
    const matches = searchSites(candidates, keyword, limitPerKeyword);
    for (const match of matches) {
      if (!seenIds.has(match.id)) {
        seenIds.add(match.id);
        combined.push(match);
      }
    }
  }

  return combined;
}
