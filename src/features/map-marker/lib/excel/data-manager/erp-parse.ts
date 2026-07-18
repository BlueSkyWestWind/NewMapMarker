import * as XLSX from 'xlsx';

/**
 * 공정관리(ERP) 시트 파서.
 * - 헤더가 1행이 아니라 중간(예: 4~5행)에 있고, 상단에 메타/집계 행이 섞여 있다.
 * - 헤더 열 이름에 줄바꿈(\r\n)이 들어 있다.
 * - '통합시설코드'가 들어있는 행을 헤더로 보고, 그 아래부터 데이터로 읽는다.
 *   (헤더가 두 줄 반복될 수 있어 '마지막' 헤더 행을 기준으로 삼는다.)
 */

/** 정규화된 헤더명(줄바꿈·중복공백 제거) → erp_details 명명 컬럼 */
const ERP_NAMED_COLUMN: Record<string, string> = {
  통합시설코드: 'facility_code',
  프로젝트: 'project',
  관리항목: 'mgmt_item',
  협력사: 'partner',
  '지역 구분': 'region_do',
  '지역 세부': 'region_sigungu',
  '국소명-최종': 'station_final',
  '국소명-계획': 'station_plan',
  방식: 'method',
  '사업 차수': 'biz_round',
  '사업 구분': 'biz_category',
  '사업 유형': 'biz_type',
  '장비최종 대분류': 'equip_final_major',
  장비최종: 'equip_final',
  'ERP 활용구분': 'erp_usage',
  'ACTA 구축완료일': 'acta_done_date',
  '부동산 형태': 'realty_type',
  건물유형: 'building_type',
  장비위치: 'equip_location',
  '공용화 단독/공용': 'sharing',
  '공용화 주관사': 'sharing_operator',
  '주소(전체)': 'address_full',
  출입방법: 'access_method',
  Site명: 'site_name',
  HW팀: 'hw_team',
  시험팀: 'test_team',
  AI담당: 'ai_manager',
  특이사항: 'remarks',
};

const HEADER_KEY = '통합시설코드'; // 헤더 행 판별 신호
const HEADER_SCAN_LIMIT = 20; // 상단 몇 행까지 헤더를 찾을지

export interface ErpParsedRow {
  facilityCode: string;
  name: string;
  address: string;
  projectCode: string;
  facilityYear: string;
  businessType: string;
  eqClass: string;
  eqType: string;
  installDate: string;
  openDate: string;
  finalStationName: string;
  /** erp_details 명명 컬럼 (snake_case → 값) */
  erp: Record<string, string | null>;
  /** 79열 전체 원본 (정규화 헤더명 → 값) */
  raw: Record<string, string | null>;
}

/** `26` → `2026`, `2026` → `2026` */
function normalizeYearToken(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{2}$/.test(trimmed)) {
    return String(2000 + Number(trimmed));
  }
  return '';
}

function extractYearFromDateLike(value: string): string {
  if (!value) return '';
  const iso = value.match(/(20\d{2})/);
  if (iso?.[1]) return iso[1];
  // 2/6/26, 26-02-06 등 끝 두 자리 연도
  const short = value.match(/(?:^|[^\d])(\d{1,2})[./-](\d{1,2})[./-](\d{2})(?:[^\d]|$)/);
  if (short?.[3]) {
    return normalizeYearToken(short[3]);
  }
  return '';
}

/**
 * 프로젝트 코드 두 번째 구간에서 사업연도(YY) 추출.
 * 예: E.M267.55.0037 → 26, AR.261.55.YRDQ → 26, E.C26J.55.0005 → 26
 * 형식: 영문.([영문]*)(YY)(숫자|문자)…
 */
export function extractYearFromProjectCode(projectCode: string): string {
  const code = projectCode.trim();
  if (!code) return '';

  const segments = code.split('.');
  if (segments.length < 2) return '';

  const second = segments[1]?.trim() ?? '';
  const match = second.match(/^([A-Za-z]*)(\d{2})([A-Za-z0-9])/);
  if (!match?.[2]) return '';

  return normalizeYearToken(match[2]);
}

/**
 * 시설연도(=사업연도) 추출 우선순위:
 * 1) 시설연도/시설년도/연도 열
 * 2) 프로젝트 코드 두 번째 구간 YY
 * 3) 국소명 `26Y_` 접두
 * 4) ACTA 구축완료일
 */
export function resolveFacilityYear(
  raw: Record<string, string | null>,
  name: string,
): string {
  const explicit =
    raw['시설연도'] || raw['시설년도'] || raw['연도'] || raw['시설 연도'];
  if (explicit) {
    const fromExplicit =
      normalizeYearToken(explicit) || extractYearFromDateLike(explicit);
    if (fromExplicit) return fromExplicit;
  }

  const fromProject = extractYearFromProjectCode(raw['프로젝트'] ?? '');
  if (fromProject) return fromProject;

  const nameMatch = name.match(/(?:^|[_\s-])(\d{2})Y(?:[_\s-]|$)/i);
  if (nameMatch?.[1]) {
    return normalizeYearToken(nameMatch[1]);
  }

  const fromActa = extractYearFromDateLike(raw['ACTA 구축완료일'] ?? '');
  if (fromActa) return fromActa;

  return '';
}

function normalizeHeader(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function cellToString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/** 시트에서 헤더 행 인덱스를 찾는다(마지막 헤더 행). 없으면 -1. */
function findHeaderRowIndex(rows: unknown[][]): number {
  let found = -1;
  const limit = Math.min(rows.length, HEADER_SCAN_LIMIT);
  for (let i = 0; i < limit; i += 1) {
    const row = rows[i] ?? [];
    const hasKey = row.some((c) => normalizeHeader(c) === HEADER_KEY);
    if (hasKey) found = i; // 중복 헤더면 더 아래 것으로 갱신
  }
  return found;
}

/** 워크북에서 ERP 헤더를 가진 첫 시트와 헤더 행을 찾는다. */
function pickErpSheet(
  workbook: XLSX.WorkBook,
): { rows: unknown[][]; headerIndex: number } | null {
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
      header: 1,
      defval: null,
      raw: false,
    });
    const headerIndex = findHeaderRowIndex(rows);
    if (headerIndex >= 0) return { rows, headerIndex };
  }
  return null;
}

export function parseErpSheet(file: File): Promise<ErpParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const picked = pickErpSheet(workbook);
        if (!picked) {
          throw new Error(
            `공정관리 시트를 찾지 못했습니다. '${HEADER_KEY}' 열이 있는 시트가 필요합니다.`,
          );
        }

        const { rows, headerIndex } = picked;
        const headerRow = rows[headerIndex] ?? [];
        const headers = headerRow.map(normalizeHeader);
        const colOf = (label: string) => headers.indexOf(label);

        const idxFacility = colOf(HEADER_KEY);
        const idxStationFinal = colOf('국소명-최종');
        const idxStationPlan = colOf('국소명-계획');
        const idxAddress = colOf('주소(전체)');

        const out: ErpParsedRow[] = [];
        for (let r = headerIndex + 1; r < rows.length; r += 1) {
          const row = rows[r] ?? [];

          const facilityCode = cellToString(row[idxFacility]) ?? '';
          const stationFinal =
            idxStationFinal >= 0 ? cellToString(row[idxStationFinal]) : null;
          const stationPlan =
            idxStationPlan >= 0 ? cellToString(row[idxStationPlan]) : null;
          const address = idxAddress >= 0 ? cellToString(row[idxAddress]) : null;

          // 핵심 식별값이 모두 비면 빈 행으로 보고 건너뜀
          if (!facilityCode && !stationFinal && !stationPlan && !address) {
            continue;
          }

          const raw: Record<string, string | null> = {};
          const erp: Record<string, string | null> = {};
          headers.forEach((header, j) => {
            if (!header) return;
            const value = cellToString(row[j]);
            raw[header] = value;
            const named = ERP_NAMED_COLUMN[header];
            if (named) erp[named] = value;
          });

          const actaDone = raw['ACTA 구축완료일'] ?? '';
          const name = stationFinal || stationPlan || facilityCode;
          out.push({
            facilityCode,
            name,
            address: address ?? '',
            projectCode: raw['프로젝트'] ?? '',
            facilityYear: resolveFacilityYear(raw, name),
            businessType: raw['사업 구분'] ?? '',
            eqClass: raw['장비최종 대분류'] ?? '',
            eqType: raw['장비최종'] ?? '',
            installDate: actaDone,
            openDate: actaDone,
            finalStationName: stationFinal ?? '',
            erp,
            raw,
          });
        }

        resolve(out);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsArrayBuffer(file);
  });
}

export const erpParseMethods: Record<string, unknown> & ThisType<unknown> = {
  parseErpSheet(file: File) {
    return parseErpSheet(file);
  },
};
