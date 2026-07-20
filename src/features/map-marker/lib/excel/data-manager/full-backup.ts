import * as XLSX from 'xlsx';
import {
  DEFAULT_MARKER_COLOR,
  getColorDisplayName,
  resolveColorToHex,
} from '@/features/map-marker/constants/facility-teams';
import {
  GROUP_ROLE_REPRESENTATIVE,
  GROUP_ROLE_SUB,
  normalizeGroupRole,
} from '@/features/map-marker/lib/address-group';
import { extractYearFromProjectCode, parseErpSheet } from './erp-parse';

export const FULL_BACKUP_TABLE_NAMES = [
  'markers',
  'information',
  'erp_details',
  'battery_markers',
  'battery_specs',
] as const;

export type FullBackupTableName = (typeof FULL_BACKUP_TABLE_NAMES)[number];

export type FullBackupTables = Record<FullBackupTableName, Record<string, unknown>[]>;

const TABLE_COLUMN = '테이블';
const JSON_OBJECT_COLUMNS = new Set(['tags', 'raw']);
const SHEET_NAME = 'mapmarker_backup';
const MARKER_ID_COLUMN = '마커아이디';
const LAT_COLUMN = '위도';
const LNG_COLUMN = '경도';
const CREATED_AT_COLUMN = '등록일';
const GROUP_ROLE_COLUMN = '구분';
const FACILITY_YEAR_COLUMN = '시설연도';
const COLOR_COLUMN = '색상';
const MEMO_COLUMN = '메모';
const TAGS_COLUMN = '태그';

/**
 * 공정관리 업로드(`통합 문서1.xlsx`) 79열 — 줄바꿈 헤더는 공백으로 정규화한 이름.
 * 백업 시트도 이 순서를 그대로 쓴다.
 */
const PROCESS_ERP_HEADERS = [
  '프로젝트',
  '통합시설코드',
  '관리항목',
  '협력사',
  '지역 구분',
  '지역 세부',
  '국소명-최종',
  '국소명-계획',
  '방식',
  '사업 차수',
  '사업 구분',
  '사업 유형',
  '세부사업 유형',
  '사업구분 대분류',
  '사업구분 중분류',
  '부대증설유형',
  '장비최종 대분류',
  '장비최종',
  '장비계획 대분류',
  '장비계획',
  '시트 발행',
  'SID 발행',
  '긴급대응',
  '모국 (&기지국)',
  '집중국',
  '인허가 대상',
  '인허가증 발행',
  '회선 업체명',
  '회선구성 방법',
  '청약 요청번호',
  '회선 청약일',
  '전송로 ENG승인',
  '회선개통 (날짜만)',
  '전기 업체',
  '전기 개통',
  '전주건식 필요여부',
  '전주건식 완료일',
  '공중선 공사',
  '장비 공사',
  '시험 완료',
  'ACTA 시험조정일',
  'ERP 활용구분',
  'ACTA 구축완료일',
  '선로 계획',
  '전기 계획',
  'H/W 계획',
  '시험 계획',
  '문제점1',
  '문제점2',
  '문제점 세부내역 및 대책방안',
  '부동산 형태',
  '건물유형',
  '장비위치',
  '공용화 단독/공용',
  '공용화 주관사',
  '참여사 3사,SKT,KT LGU+,단독',
  '철탑 형태',
  '철탑 규격',
  '공중선 형상',
  '주소(전체)',
  '출입방법',
  '대상여부(대상,불필요)',
  '수령일',
  '특이사항 (현장특이사항 및 불필요사유)',
  '공가 신청',
  '공가 승인',
  '착공계제출 (BP->한전)',
  '준공계제출 (BP->한전)',
  '해지공가 요청',
  '해지공가 승인',
  '특이사항',
  'Site명',
  'HW팀',
  '시험팀',
  'AI담당',
  '릴리즈구분',
  '불완전 치국대상',
  '사전설계 대상여부',
  '사전설계 완료일',
] as const;

/** 백업 다운로드 시 무조건 맨 앞에 오는 열 (태그는 색상 바로 옆에 배치) */
const BACKUP_LEADING_HEADERS = [
  LAT_COLUMN,
  LNG_COLUMN,
  MARKER_ID_COLUMN,
  CREATED_AT_COLUMN,
  GROUP_ROLE_COLUMN,
  FACILITY_YEAR_COLUMN,
  COLOR_COLUMN,
  TAGS_COLUMN,
  MEMO_COLUMN,
] as const;

/** 태그 배열 ↔ 백업 셀(쉼표 구분 문자열) 변환. api.ts normalizeMarkerTags 와 호환. */
function serializeTagsCell(tags: unknown): string {
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).trim()).filter(Boolean).join(', ');
  }
  if (typeof tags === 'string') {
    return tags.trim();
  }
  return '';
}

function parseTagsCell(value: unknown): string[] {
  const text = String(value ?? '').trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((tag) => String(tag).trim()).filter(Boolean);
      }
    } catch {
      // 구분자 분리로 폴백
    }
  }
  return text
    .split(/[,|/]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeHeaderKey(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TABLE_COLUMNS: Record<FullBackupTableName, readonly string[]> = {
  markers: [
    'id',
    'name',
    'lat',
    'lng',
    'memo',
    'tags',
    'color',
    'facility_team',
    'facility_code',
    'road_address',
    'jibun_address',
    'parent_marker_id',
    'group_role',
    'created_at',
  ],
  information: [
    'id',
    'marker_id',
    'place_name',
    'facility_code',
    'project_code',
    'facility_year',
    'business_type',
    'final_station_name',
    'eq_class',
    'eq_type',
    'install_date',
    'open_date',
    'created_at',
  ],
  erp_details: [
    'id',
    'marker_id',
    'facility_code',
    'project',
    'mgmt_item',
    'partner',
    'region_do',
    'region_sigungu',
    'station_final',
    'station_plan',
    'method',
    'biz_round',
    'biz_category',
    'biz_type',
    'equip_final_major',
    'equip_final',
    'erp_usage',
    'acta_done_date',
    'realty_type',
    'building_type',
    'equip_location',
    'sharing',
    'sharing_operator',
    'address_full',
    'access_method',
    'site_name',
    'hw_team',
    'test_team',
    'ai_manager',
    'remarks',
    'raw',
    'created_at',
  ],
  battery_markers: [
    'id',
    'name',
    'lat',
    'lng',
    'address',
    'memo',
    'tags',
    'color',
    'facility_team',
    'created_at',
  ],
  battery_specs: [
    'id',
    'marker_id',
    'erp_name',
    'capacity',
    'quantity',
    'station_name',
    'created_at',
  ],
};

function isFullBackupTableName(value: string): value is FullBackupTableName {
  return (FULL_BACKUP_TABLE_NAMES as readonly string[]).includes(value);
}

const EXCEL_MAX_CELL_LENGTH = 32767;

function serializeCellValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    if (json.length > EXCEL_MAX_CELL_LENGTH) {
      throw new Error(
        `엑셀 셀 길이 제한(${EXCEL_MAX_CELL_LENGTH})을 초과한 값이 있습니다.`,
      );
    }
    return json;
  }
  if (typeof value === 'string') {
    if (value.length > EXCEL_MAX_CELL_LENGTH) {
      throw new Error(
        `엑셀 셀 길이 제한(${EXCEL_MAX_CELL_LENGTH})을 초과한 문자열이 있습니다.`,
      );
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return String(value);
}

function parseCellValue(column: string, value: unknown): unknown {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  if (JSON_OBJECT_COLUMNS.has(column) && typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return column === 'tags' ? [] : {};
    }
  }

  return value;
}

/** 로컬 날짜 기준 `yyyymmdd_파일명.xlsx` */
export function buildDatedBackupFilename(baseName: string): string {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const safeBase = baseName.replace(/\.xlsx$/i, '');
  return `${yyyy}${mm}${dd}_${safeBase}.xlsx`;
}

function createEmptyTables(): FullBackupTables {
  return {
    markers: [],
    information: [],
    erp_details: [],
    battery_markers: [],
    battery_specs: [],
  };
}

function normalizeRawRecord(
  record: Record<string, unknown>,
): Record<string, string | null> {
  const normalized: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(record)) {
    const header = normalizeHeaderKey(key);
    if (!header) continue;
    if (value == null || value === '') {
      normalized[header] = null;
      continue;
    }
    normalized[header] = String(value);
  }
  return normalized;
}

function parseRawField(raw: unknown): Record<string, string | null> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return normalizeRawRecord(parsed as Record<string, unknown>);
      }
      return {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return normalizeRawRecord(raw as Record<string, unknown>);
  }
  return {};
}

function getRawCellValue(
  raw: Record<string, string | null>,
  header: string,
): string {
  const direct = raw[header];
  if (direct != null && direct !== '') {
    return String(direct);
  }
  return '';
}

function toCoordCell(value: unknown): string | number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }
  return '';
}

function buildProcessExcelRow(
  raw: Record<string, string | null>,
  extras: {
    lat: unknown;
    lng: unknown;
    markerId: string;
    createdAt: string;
    groupRole: string;
    facilityYear: string;
    color: string;
    memo: string;
    tags: unknown;
  },
): Record<string, string | number | boolean> {
  const excelRow: Record<string, string | number | boolean> = {};
  excelRow[LAT_COLUMN] = toCoordCell(extras.lat);
  excelRow[LNG_COLUMN] = toCoordCell(extras.lng);
  excelRow[MARKER_ID_COLUMN] = extras.markerId;
  excelRow[CREATED_AT_COLUMN] = extras.createdAt;
  excelRow[GROUP_ROLE_COLUMN] = extras.groupRole;
  excelRow[FACILITY_YEAR_COLUMN] =
    extras.facilityYear ||
    getRawCellValue(raw, FACILITY_YEAR_COLUMN) ||
    extractYearFromProjectCode(getRawCellValue(raw, '프로젝트'));
  excelRow[COLOR_COLUMN] = getColorDisplayName(
    extras.color || DEFAULT_MARKER_COLOR,
  );
  excelRow[MEMO_COLUMN] = extras.memo || '';
  excelRow[TAGS_COLUMN] = serializeTagsCell(extras.tags);
  for (const header of PROCESS_ERP_HEADERS) {
    excelRow[header] = getRawCellValue(raw, header);
  }
  return excelRow;
}

/**
 * 맨 앞: 위도/경도/마커아이디/등록일/구분/시설연도/색상
 * 이어서 공정관리 79열. 축전지는 하단에 `테이블` 구분 행으로 이어 붙인다.
 */
export function buildFullBackupSheetRows(
  tables: FullBackupTables,
): Record<string, string | number | boolean>[] {
  const rows: Record<string, string | number | boolean>[] = [];
  const markerById = new Map(
    tables.markers.map((marker) => [String(marker.id ?? ''), marker]),
  );

  const infoYearByMarkerId = new Map<string, string>();
  for (const info of tables.information) {
    const markerId = String(info.marker_id ?? '');
    const year = String(info.facility_year ?? '').trim();
    if (markerId && year && !infoYearByMarkerId.has(markerId)) {
      infoYearByMarkerId.set(markerId, year);
    }
  }

  const exportedMarkerIds = new Set<string>();

  for (const erp of tables.erp_details) {
    const raw = parseRawField(erp.raw);
    const markerId = String(erp.marker_id ?? '');
    const marker = markerById.get(markerId);
    rows.push(
      buildProcessExcelRow(raw, {
        lat: marker?.lat,
        lng: marker?.lng,
        markerId: markerId || '',
        createdAt: String(marker?.created_at ?? erp.created_at ?? ''),
        groupRole:
          normalizeGroupRole(marker?.group_role) ||
          (marker?.parent_marker_id
            ? GROUP_ROLE_SUB
            : GROUP_ROLE_REPRESENTATIVE),
        facilityYear: infoYearByMarkerId.get(markerId) || '',
        color: String(marker?.color ?? DEFAULT_MARKER_COLOR),
        memo: String(marker?.memo ?? ''),
        tags: marker?.tags,
      }),
    );
    if (markerId) {
      exportedMarkerIds.add(markerId);
    }
  }

  for (const marker of tables.markers) {
    const markerId = String(marker.id ?? '');
    if (!markerId || exportedMarkerIds.has(markerId)) {
      continue;
    }
    rows.push(
      buildProcessExcelRow(
        {
          통합시설코드: String(marker.facility_code ?? '') || null,
          '국소명-최종': String(marker.name ?? '') || null,
          '주소(전체)':
            String(marker.road_address || marker.jibun_address || '') || null,
        },
        {
          lat: marker.lat,
          lng: marker.lng,
          markerId,
          createdAt: String(marker.created_at ?? ''),
          groupRole:
            normalizeGroupRole(marker.group_role) ||
            (marker.parent_marker_id
              ? GROUP_ROLE_SUB
              : GROUP_ROLE_REPRESENTATIVE),
          facilityYear: infoYearByMarkerId.get(markerId) || '',
          color: String(marker.color ?? DEFAULT_MARKER_COLOR),
          memo: String(marker.memo ?? ''),
          tags: marker.tags,
        },
      ),
    );
  }

  // 축전지: 레거시 구분 열 형식으로 하단에 추가
  for (const tableName of ['battery_markers', 'battery_specs'] as const) {
    for (const row of tables[tableName]) {
      const excelRow: Record<string, string | number | boolean> = {
        [TABLE_COLUMN]: tableName,
      };
      for (const [key, value] of Object.entries(row)) {
        excelRow[key] = serializeCellValue(value);
      }
      rows.push(excelRow);
    }
  }

  return rows;
}

export function parseFullBackupSheetRows(
  rows: Record<string, unknown>[],
): FullBackupTables {
  const tables = createEmptyTables();

  for (const row of rows) {
    const tableRaw = row[TABLE_COLUMN];
    const tableName = typeof tableRaw === 'string' ? tableRaw.trim() : '';
    if (!isFullBackupTableName(tableName)) {
      continue;
    }

    const allowedColumns = new Set(TABLE_COLUMNS[tableName]);
    const record: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === TABLE_COLUMN || !allowedColumns.has(key)) {
        continue;
      }
      if (value === '' || value === null || value === undefined) {
        continue;
      }
      record[key] = parseCellValue(key, value);
    }
    tables[tableName].push(record);
  }

  return tables;
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * 공정관리(업로드) 형식 + 위도/경도/마커아이디 열을 DB 테이블 스냅샷으로 변환한다.
 */
export async function parseErpStyleBackupToTables(file: File): Promise<FullBackupTables> {
  const erpRows = await parseErpSheet(file);
  if (!erpRows.length) {
    throw new Error('공정관리 형식 데이터를 찾지 못했습니다.');
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('엑셀 시트를 찾을 수 없습니다.');
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: false,
  });

  let headerIndex = -1;
  for (let i = 0; i < Math.min(grid.length, 20); i += 1) {
    const row = grid[i] ?? [];
    if (row.some((cell) => String(cell).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() === '통합시설코드')) {
      headerIndex = i;
    }
  }
  if (headerIndex < 0) {
    throw new Error('통합시설코드 헤더를 찾지 못했습니다.');
  }

  const headers = (grid[headerIndex] ?? []).map((cell) =>
    String(cell ?? '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  const idxFacility = headers.indexOf('통합시설코드');
  const idxLat = headers.indexOf(LAT_COLUMN);
  const idxLng = headers.indexOf(LNG_COLUMN);
  const idxMarkerId = headers.indexOf(MARKER_ID_COLUMN);
  const idxCreatedAt = headers.indexOf(CREATED_AT_COLUMN);

  const idxGroupRole = headers.indexOf(GROUP_ROLE_COLUMN);
  const idxColor = Math.max(
    headers.indexOf(COLOR_COLUMN),
    headers.indexOf('마커색상'),
  );
  const idxMemo = headers.indexOf(MEMO_COLUMN);
  const idxTags = headers.indexOf(TAGS_COLUMN);

  const coordByFacility = new Map<
    string,
    {
      lat: number | null;
      lng: number | null;
      markerId: string;
      createdAt: string;
      groupRole: string;
      color: string;
      memo: string;
      tags: string[];
    }
  >();

  for (let r = headerIndex + 1; r < grid.length; r += 1) {
    const row = grid[r] ?? [];
    if (String(row[headers.indexOf(TABLE_COLUMN)] ?? '').trim()) {
      continue;
    }
    const facilityCode = String(row[idxFacility] ?? '').trim();
    if (!facilityCode || facilityCode === '통합시설코드') {
      continue;
    }
    coordByFacility.set(facilityCode, {
      lat: idxLat >= 0 ? parseOptionalNumber(row[idxLat]) : null,
      lng: idxLng >= 0 ? parseOptionalNumber(row[idxLng]) : null,
      markerId: idxMarkerId >= 0 ? String(row[idxMarkerId] ?? '').trim() : '',
      createdAt: idxCreatedAt >= 0 ? String(row[idxCreatedAt] ?? '').trim() : '',
      groupRole:
        idxGroupRole >= 0
          ? normalizeGroupRole(row[idxGroupRole])
          : '',
      color:
        idxColor >= 0
          ? resolveColorToHex(row[idxColor])
          : DEFAULT_MARKER_COLOR,
      memo: idxMemo >= 0 ? String(row[idxMemo] ?? '').trim() : '',
      tags: idxTags >= 0 ? parseTagsCell(row[idxTags]) : [],
    });
  }

  const tables = createEmptyTables();
  const usedIds = new Set<string>();
  const nowIso = new Date().toISOString();

  for (const row of erpRows) {
    const extras = coordByFacility.get(row.facilityCode);
    let id = extras?.markerId || (row.facilityCode ? `erp_${row.facilityCode}` : '');
    if (!id) {
      id = `erp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
    let uniqueId = id;
    let n = 1;
    while (usedIds.has(uniqueId)) {
      uniqueId = `${id}_${n++}`;
    }
    usedIds.add(uniqueId);

    const address = row.address || '';
    tables.markers.push({
      id: uniqueId,
      name: row.name,
      lat: extras?.lat ?? null,
      lng: extras?.lng ?? null,
      memo: extras?.memo || '',
      tags: extras?.tags || [],
      color: extras?.color || DEFAULT_MARKER_COLOR,
      facility_team: '',
      facility_code: row.facilityCode || null,
      road_address: address,
      jibun_address: '',
      group_role: extras?.groupRole || '',
      created_at: extras?.createdAt || nowIso,
    });
    tables.information.push({
      marker_id: uniqueId,
      place_name: row.name,
      facility_code: row.facilityCode || null,
      project_code: row.projectCode,
      facility_year: row.facilityYear || '',
      business_type: row.businessType,
      final_station_name: row.finalStationName,
      eq_class: row.eqClass,
      eq_type: row.eqType,
      install_date: row.installDate,
      open_date: row.openDate,
    });
    tables.erp_details.push({
      marker_id: uniqueId,
      ...row.erp,
      facility_code: row.facilityCode || row.erp.facility_code || null,
      raw: row.raw,
    });
  }

  // 같은 파일에 축전지 구분 행이 있으면 합친다.
  const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[sheetName],
    { defval: '' },
  );
  const batteryTables = parseFullBackupSheetRows(sheetRows);
  tables.battery_markers = batteryTables.battery_markers;
  tables.battery_specs = batteryTables.battery_specs;

  return tables;
}

export function countFullBackupRows(tables: FullBackupTables): number {
  return FULL_BACKUP_TABLE_NAMES.reduce((sum, name) => sum + tables[name].length, 0);
}

function isLegacyTableBackup(rows: Record<string, unknown>[]): boolean {
  return rows.some((row) => {
    const table = row[TABLE_COLUMN];
    return typeof table === 'string' && isFullBackupTableName(table.trim());
  });
}

function buildWorksheetFromRows(
  rows: Record<string, string | number | boolean>[],
): XLSX.WorkSheet {
  // 선두 6열 → 공정 79열 → (축전지) 테이블·기타 열
  const headerSet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      headerSet.add(key);
    }
  }

  const headers: string[] = [
    ...BACKUP_LEADING_HEADERS,
    ...PROCESS_ERP_HEADERS,
  ];
  for (const header of headers) {
    headerSet.delete(header);
  }
  if (headerSet.has(TABLE_COLUMN)) {
    headers.push(TABLE_COLUMN);
    headerSet.delete(TABLE_COLUMN);
  }
  for (const key of headerSet) {
    headers.push(key);
  }

  const aoa: (string | number | boolean)[][] = [headers];
  for (const row of rows) {
    aoa.push(headers.map((header) => row[header] ?? ''));
  }

  return XLSX.utils.aoa_to_sheet(aoa);
}

export const fullBackupMethods: Record<string, unknown> & ThisType<Record<string, unknown>> = {
  /**
   * 공정관리(업로드)와 같은 한글 열 1시트로 전체 장비 데이터를 백업한다.
   */
  exportFullBackupToExcel(tables: FullBackupTables, filename?: string) {
    const rows = buildFullBackupSheetRows(tables);
    if (!rows.length) {
      throw new Error('백업할 데이터가 없습니다.');
    }

    const worksheet = buildWorksheetFromRows(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME);

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const downloadName = filename || buildDatedBackupFilename('mapmarker_backup');
    (
      this as {
        _triggerDownloadBuffer: (b: ArrayBuffer, n: string, m: string) => void;
      }
    )._triggerDownloadBuffer(
      buffer,
      downloadName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    const headerCount = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0];
    return {
      rowCount: rows.length,
      headerCount: Array.isArray(headerCount) ? headerCount.length : 0,
      tables: {
        markers: tables.markers.length,
        information: tables.information.length,
        erp_details: tables.erp_details.length,
        battery_markers: tables.battery_markers.length,
        battery_specs: tables.battery_specs.length,
      },
    };
  },

  /**
   * 전체 백업 엑셀 파싱.
   * - 신규: 공정관리(한글 열) 형식
   * - 레거시: `테이블` 구분 열 형식
   */
  async parseFullBackupExcel(file: File): Promise<FullBackupTables> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName =
      workbook.SheetNames.find((name) => name === SHEET_NAME) ?? workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error('엑셀 시트를 찾을 수 없습니다.');
    }

    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '',
    });

    if (isLegacyTableBackup(rows)) {
      const tables = parseFullBackupSheetRows(rows);
      if (countFullBackupRows(tables) === 0) {
        throw new Error('복원할 데이터가 없습니다.');
      }
      return tables;
    }

    return parseErpStyleBackupToTables(file);
  },
};
