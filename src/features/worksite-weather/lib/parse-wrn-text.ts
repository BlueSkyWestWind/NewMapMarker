import type { WeatherAlert } from "@/features/worksite-weather/types/weather";

/**
 * 기상청 API 허브 `typ01/url/wrn_now_data.php`(특보현황) 응답 파서.
 *
 * 실응답으로 확인한 형식 (2026-07-26):
 * - 인코딩 **EUC-KR** (호출부에서 디코드해 넘긴다)
 * - 헤더 줄은 `#`로 시작하고 컬럼명이 **공백 구분 + 뒤에 하이픈 패딩**
 *   `# REG_UP  REG_UP_KO-----  REG_ID  REG_KO-----  TM_FC  TM_EF  WRN  LVL  CMD  ED_TM`
 * - 데이터 줄은 **쉼표 구분**, 값은 공백 패딩, 줄 끝에 `=`
 *   `L1050000, 전라남도 , L1051200, 순천시 , 202607231300, 202607231400, 폭염 , 경보 , 변경,  ,=`
 * - WRN/LVL/CMD는 코드가 아니라 **한글 문자열**(폭염·열대야 / 주의·경보·중대경보 / 발표·변경)
 *
 * 기상청 DB 스키마 문서(WRN2_MET_DATA)의 코드값(W/1/1)과는 다르다. 실응답을 기준으로 한다.
 */

/** 해제·취소 계열은 발효 목록에서 뺀다. 그 외(발표·변경·갱신·대치)는 유효로 본다. */
function isActiveCommand(cmd: string): boolean {
  return !!cmd && !cmd.includes("해제") && !cmd.includes("취소");
}

const DOCUMENTED_COLUMNS = [
  "REG_UP", "REG_UP_KO", "REG_ID", "REG_KO", "TM_FC", "TM_EF", "WRN", "LVL", "CMD", "ED_TM",
] as const;

function normalize(value: string): string {
  return value.replace(/\s+/g, "");
}

/**
 * 시·도 정식명 ↔ 통용 축약명.
 * "전라남도 → 전남"처럼 규칙(접미사 제거)으로는 유도되지 않아 명시적으로 적는다.
 */
const REGION_ALIASES: ReadonlyArray<readonly string[]> = [
  ["전라남도", "전남"],
  ["전라북도", "전북"],
  ["경상남도", "경남"],
  ["경상북도", "경북"],
  ["충청남도", "충남"],
  ["충청북도", "충북"],
  ["강원특별자치도", "강원도", "강원"],
  ["제주특별자치도", "제주도", "제주"],
  ["경기도", "경기"],
  ["서울특별시", "서울"],
  ["부산광역시", "부산"],
  ["대구광역시", "대구"],
  ["인천광역시", "인천"],
  ["광주광역시", "광주"],
  ["대전광역시", "대전"],
  ["울산광역시", "울산"],
  ["세종특별자치시", "세종"],
];

/** 시·도 표기를 정식명 하나로 모은다. 판정 불가면 null. */
function canonicalProvince(name: string): string | null {
  const value = normalize(name);
  if (!value) return null;

  for (const group of REGION_ALIASES) {
    if (group.some((alias) => value === alias)) return group[0];
  }
  return null;
}

/** 주소 맨 앞 토큰을 시·도로 해석한다. ("전남 순천시 조례동" → 전라남도) */
function addressProvince(address: string): string | null {
  const head = address.trim().split(/\s+/)[0] ?? "";
  return canonicalProvince(head);
}

/**
 * 특보 지역이 작업 국소 주소에 해당하는지.
 * 응답에 REG_KO(한글 특보구역명)가 있어 구역코드 테이블 없이 주소와 직접 대조한다.
 *
 * 특보구역 체계가 시·도 종류에 따라 다르다는 점이 핵심이다.
 * - 도(道): REG_KO가 시·군 단위 ("전라남도 / 순천시") → 그 이름이 주소에 있어야 한다.
 *   상위 도까지 허용하면 장성군 특보가 순천 국소에 뜬다.
 * - 광역시·특별시: REG_KO가 시 내부 권역 ("광주광역시 / 광주서부") → 주소와 문자열이 겹치지 않는다.
 *   시·도가 일치하면 그 도시 전체에 걸린 것으로 본다.
 */
export function matchesRegion(regKo: string, regUpKo: string, address: string): boolean {
  const target = normalize(address);
  // 지역을 특정할 수 없으면 매칭하지 않는다.
  // 전국 특보를 그대로 몰아 적용하면 타 지역 호우주의보 하나로 작업중지가 떠버린다.
  if (!target) return false;

  const city = normalize(regKo);
  const province = canonicalProvince(regUpKo);
  const home = addressProvince(address);

  // 시·도가 서로 다르면 볼 것도 없다 (경기도 광주시 ↔ 광주광역시 혼동 방지)
  if (province && home && province !== home) return false;

  if (province && province === home) {
    // 광역시·특별시는 권역명이 주소에 없으므로 시 단위 일치로 본다
    if (province.endsWith("시")) return true;
    // 도인데 특보구역이 시·군을 특정하지 않으면 도 전역 특보다
    if (!city) return true;
  }

  return city ? target.includes(city) : false;
}

/** 헤더 줄의 컬럼명에서 정렬용 하이픈 패딩을 떼어낸다. */
function cleanColumnName(token: string): string {
  return token.replace(/-+$/, "").trim();
}

/** 컬럼명이 나열된 헤더 줄을 찾는다. 설명 줄에는 컬럼명이 하나씩만 있어 걸리지 않는다. */
function findHeader(lines: string[]): string[] | null {
  for (const line of lines) {
    if (!line.startsWith("#")) continue;
    const body = line.replace(/^#+/, "").trim();
    if (!body.includes("REG_ID") || !body.includes("WRN")) continue;

    const names = body.split(/\s+/).map(cleanColumnName).filter(Boolean);
    if (names.length >= 8) return names;
  }
  return null;
}

export interface ParsedAlerts {
  alerts: WeatherAlert[];
  /** 응답 형식을 해석했는지. false면 화면에 "특보 확인 불가" 경고를 띄운다. */
  parsed: boolean;
}

export function parseWrnNowText(raw: string, address: string): ParsedAlerts {
  const text = (raw ?? "").trim();
  if (!text) return { alerts: [], parsed: false };

  // 지역을 모르면 어떤 특보가 이 국소에 걸리는지 판단할 수 없다.
  // 조용히 빈 목록을 내면 "특보 없음"으로 오인되므로 확인 불가로 알린다.
  if (!address.trim()) return { alerts: [], parsed: false };

  const lines = text.split(/\r?\n/);
  const columns = findHeader(lines) ?? [...DOCUMENTED_COLUMNS];

  const iRegUpKo = columns.indexOf("REG_UP_KO");
  const iRegKo = columns.indexOf("REG_KO");
  const iTmFc = columns.indexOf("TM_FC");
  const iTmEf = columns.indexOf("TM_EF");
  const iWrn = columns.indexOf("WRN");
  const iLvl = columns.indexOf("LVL");
  const iCmd = columns.indexOf("CMD");

  // 필수 컬럼을 못 찾으면 위치를 추측하지 않는다
  if (iWrn < 0 || iLvl < 0 || iCmd < 0 || iRegKo < 0) {
    return { alerts: [], parsed: false };
  }

  const dataLines = lines.filter(
    (line) => line.trim() && !line.startsWith("#") && line.includes(","),
  );

  const alerts: WeatherAlert[] = [];
  let malformed = 0;

  for (const line of dataLines) {
    // 값은 공백으로 패딩되어 있고 줄 끝에 '='가 붙는다
    const cells = line.replace(/,?=\s*$/, "").split(",").map((cell) => cell.trim());
    const needed = Math.max(iWrn, iLvl, iCmd, iRegKo);
    if (cells.length <= needed) {
      malformed += 1;
      continue;
    }

    const type = cells[iWrn];
    const level = cells[iLvl];
    if (!type || !level) {
      malformed += 1;
      continue;
    }
    if (!isActiveCommand(cells[iCmd])) continue;

    const regKo = cells[iRegKo] ?? "";
    const regUpKo = iRegUpKo >= 0 ? (cells[iRegUpKo] ?? "") : "";
    if (!matchesRegion(regKo, regUpKo, address)) continue;

    alerts.push({
      type,
      // 응답은 "주의"로 오지만 통용 표기는 "주의보"다
      level: level === "주의" ? "주의보" : level,
      region: regKo || regUpKo,
      issuedAt: (iTmEf >= 0 ? cells[iTmEf] : "") || (iTmFc >= 0 ? cells[iTmFc] : ""),
    });
  }

  // 데이터 줄은 있는데 전부 해석 실패면 형식이 예상과 다른 것이다
  const parsed = dataLines.length === 0 || malformed < dataLines.length;
  return { alerts, parsed };
}
