// 의존 방향 가드: 공용 레이어(src/lib)가 피처(src/features)를 import하는 역방향 의존을 막는다.
// 설계: docs/Ver_3.0/의존방향정리/Ver_3.0_의존방향정리_설계.md §3.2

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type ArchRuleId = "no-lib-to-feature";

/** 의도적 예외: "경로:규칙" → 이유. 이유 없이 넣지 않는다. */
const ALLOW: Partial<Record<`${string}:${ArchRuleId}`, string>> = {
  "src/lib/api/kakao-route-upstream.ts:no-lib-to-feature":
    "서버 전용 카카오 길찾기 모듈이 @/features/route/types/route의 타입만 import type으로 참조한다. 타입을 src/types/로 옮기는 후속 작업 전까지 허용",
};

const IMPORT_FEATURE_RE = /from\s+["']@\/features\//;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name).replace(/\\/g, "/");
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) {
      out.push(path);
    }
  }
}

function findMatchingLines(filePath: string, pattern: RegExp): { line: number; text: string }[] {
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const hits: { line: number; text: string }[] = [];
  lines.forEach((raw, idx) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    if (pattern.test(raw)) hits.push({ line: idx + 1, text: trimmed });
  });
  return hits;
}

describe("arch-guard", () => {
  it("no-lib-to-feature: src/lib/** 는 @/features/ 를 import하지 않는다", () => {
    const libFiles: string[] = [];
    walk("src/lib", libFiles);

    const violations: string[] = [];
    for (const file of libFiles) {
      if (ALLOW[`${file}:no-lib-to-feature`]) continue;
      for (const hit of findMatchingLines(file, IMPORT_FEATURE_RE)) {
        violations.push(`${file}:${hit.line}: ${hit.text}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("허용 예외로 적은 파일이 실제로 존재한다(지워진 예외가 남지 않게)", () => {
    for (const key of Object.keys(ALLOW)) {
      const file = key.split(":")[0];
      expect(() => statSync(file), `${file} 이(가) 없다. ALLOW에서 지운다`).not.toThrow();
    }
  });
});

const ALLOWED_FEATURE_EDGES: Record<`${string}->${string}`, string> = {
  "accounts->worksite-weather": "계정 관리 API·기상청 사용량 다이얼로그가 KmaUsageReport와 중단 판정을 쓴다",
  "barcode->shell": "바코드 라이트박스·패널이 지도 오프셋 훅(useMapLeftOffset)과 PanelSection을 쓴다",
  "cctv->map-marker": "CCTV 패널이 map-marker 스토어(useMapMarkerStore)로 선택 CCTV·지도 상태를 다룬다",
  "cctv->shell": "CCTV 영상 모달이 지도 오프셋 훅(useMapLeftOffset)을 쓴다",
  "dashboard->map-marker": "대시보드 패널이 위치 주소·엑셀 섹션을 임베드한다",
  "dashboard->route": "대시보드 패널이 경로탐색 패널(RoutePanel)을 임베드한다",
  "dashboard->schedule": "대시보드 당일 작업 국소 훅·유틸이 일정 범위(useScheduleRange)와 todayIso를 쓴다",
  "dashboard->shell": "대시보드 패널이 셸 스토어(useShellStore)와 PanelSection을 쓴다",
  "dashboard->worksite-weather": "대시보드 패널이 작업장 날씨 위험 요약(HazardSummaryList)과 갱신 메시지를 쓴다",
  "gpsmap->map-marker": "좌표 변환 패널이 map-marker 스토어와 위치 마커 생성(createLocationMarker)을 쓴다",
  "group-admin->map-marker": "그룹관리 타입·다이얼로그가 EquipmentMarker·GroupRole 등 마커 도메인 모델을 쓴다",
  "group-admin->shell": "그룹관리 다이얼로그·패널이 shell 폭 상수를 쓴다",
  "group-admin->site-lists": "그룹 필터가 site-lists의 searchEquipmentSites 검색 유틸을 쓴다",
  "map-marker->cctv": "지도 페이지와 스토어가 CctvVideoModal 지연 로드와 CctvItem 타입을 쓴다",
  "map-marker->gpsmap": "지도 페이지와 상세 GPS 카드가 VworldPaneOverlay·MapPickHint 등 gpsmap UI를 쓴다",
  "map-marker->group-admin": "마커 그룹 액션·목록 훅이 group-admin의 그룹 연산(group-ops·group-actions)을 쓴다",
  "map-marker->route": "지도 캔버스와 경로 레이어 훅이 경로 스토어(useRouteStore)를 구독한다",
  "map-marker->shell": "지도 페이지와 ERP 다이얼로그가 AppShell과 shell 폭 상수를 쓴다",
  "map-marker->site-lists": "마커 상세 모달과 백업 훅이 SiteListMembership과 SiteListBackup 타입을 쓴다",
  "map-marker->worksite-weather": "위치 마커·말풍선 콘텐츠가 worksite-weather 국소 검색과 SiteMatch 타입을 쓴다",
  "route->map-marker": "경로 출발지 선택기가 좌표 검증(isPlottableCoordinate)과 지오코딩(geocodeAddress)을 쓴다",
  "schedule->map-marker": "일정 API·훅이 map-marker의 페이지네이션 조회(fetchAllRows)를 쓴다",
  "schedule->shell": "일정 셀 다이얼로그·그리드·스위치가 shell 폭 상수를 쓴다",
  "schedule->worksite-weather": "미배정 국소 유틸이 worksite-weather의 문자열 정규화(normalize)를 쓴다",
  "shell->accounts": "AppShell이 계정 설정 메인(AccountsMain)을 지연 로드한다",
  "shell->barcode": "AppShell과 PanelBody가 바코드 결과·패널을 지연 로드한다",
  "shell->cctv": "AppShell과 지도 패널이 CCTV 패널을 지연 로드·프리로드한다",
  "shell->dashboard": "AppShell과 PanelBody가 대시보드 패널을 지연 로드·프리로드한다",
  "shell->gpsmap": "상단 검색바와 지도 패널이 MapPickControls와 좌표 변환 패널을 쓴다",
  "shell->group-admin": "AppShell과 마커 패널이 그룹관리 패널을 지연 로드·프리로드한다",
  "shell->map-marker": "AppShell·계정메뉴·모바일셸 등이 useMapMarkerStore와 인증 헤더를 쓴다",
  "shell->schedule": "AppShell이 일정 뷰(ScheduleView)를 지연 로드·프리로드한다",
  "shell->site-lists": "AppShell과 지도 패널이 국소 목록 개수 훅과 패널을 쓴다",
  "shell->site-survey": "AppShell이 현장실사서 메인(SiteSurveyMain)을 지연 로드한다",
  "site-lists->map-marker": "국소 목록 API와 멤버 다이얼로그가 fetchAllRows와 useMapMarkersQuery를 쓴다",
  "site-lists->shell": "국소 목록 패널이 PanelSection을 쓴다",
  "worksite-weather->map-marker": "작업장 검색 유틸이 EquipmentMarker 타입과 그룹 역할 정규화를 쓴다",
};
const MAX_BIDIRECTIONAL_PAIRS = 13;

const FEATURE_CROSS_IMPORT_RE = /(?:from\s+|import\s*\(\s*)["']@\/features\/([^/"']+)/g;

function collectFeatureEdges(): Map<string, string[]> {
  const edges = new Map<string, string[]>();
  const featureDirs = readdirSync("src/features").filter((name) =>
    statSync(join("src/features", name)).isDirectory(),
  );

  for (const fromFeature of featureDirs) {
    const files: string[] = [];
    walk(`src/features/${fromFeature}`, files);
    for (const file of files) {
      for (const hit of findMatchingLines(file, /(?:from\s+|import\s*\(\s*)["']@\/features\//)) {
        FEATURE_CROSS_IMPORT_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = FEATURE_CROSS_IMPORT_RE.exec(hit.text)) !== null) {
          const toFeature = match[1];
          if (toFeature === fromFeature) continue;
          const edge = `${fromFeature}->${toFeature}`;
          const list = edges.get(edge) ?? [];
          const ref = `${file}:${hit.line}`;
          if (!list.includes(ref)) list.push(ref);
          edges.set(edge, list);
        }
      }
    }
  }
  return edges;
}

function findBidirectionalPairs(edges: Map<string, string[]>): string[] {
  const pairs: string[] = [];
  for (const edge of edges.keys()) {
    const [a, b] = edge.split("->");
    if (a < b && edges.has(`${b}->${a}`)) {
      pairs.push(`${a}<->${b}`);
    }
  }
  return pairs.sort();
}

describe("feature-edges", () => {
  it("feature-edges: 허용 목록과 현재 의존이 같다", () => {
    const actual = collectFeatureEdges();
    const problems: string[] = [];

    for (const [edge, refs] of [...actual.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (!(edge in ALLOWED_FEATURE_EDGES)) {
        problems.push(`새 의존: ${edge} (${refs.slice(0, 3).join(", ")}${refs.length > 3 ? ` 외 ${refs.length - 3}건` : ""})`);
      }
    }
    for (const edge of Object.keys(ALLOWED_FEATURE_EDGES).sort()) {
      if (!actual.has(edge)) {
        problems.push(`해소된 의존: ${edge} (ALLOWED_FEATURE_EDGES에서 지운다)`);
      }
    }

    expect(problems).toEqual([]);
  });

  it("feature-edges: 양방향 쌍은 늘지도 줄지도 않는다", () => {
    const pairs = findBidirectionalPairs(collectFeatureEdges());
    if (pairs.length < MAX_BIDIRECTIONAL_PAIRS) {
      expect(
        pairs.length,
        `양방향 쌍이 ${MAX_BIDIRECTIONAL_PAIRS}개에서 ${pairs.length}개로 줄었다. MAX_BIDIRECTIONAL_PAIRS 값을 낮춘다 (${pairs.join(", ")})`,
      ).toBe(MAX_BIDIRECTIONAL_PAIRS);
    }
    expect(
      pairs.length,
      `양방향 쌍이 ${MAX_BIDIRECTIONAL_PAIRS}개에서 ${pairs.length}개로 늘었다 (${pairs.join(", ")})`,
    ).toBe(MAX_BIDIRECTIONAL_PAIRS);
  });
});
