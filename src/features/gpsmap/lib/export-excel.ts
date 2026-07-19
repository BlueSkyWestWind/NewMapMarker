import * as XLSX from 'xlsx';
import type { BatchRow } from './batch-lookup';
import type { GpsLookupResult } from './lookup';

const HEADERS = [
  '입력값',
  '상태',
  '검색출처',
  '구주소',
  '신주소',
  '우편번호',
  '위도',
  '경도',
  '위도(도분초)',
  '경도(도분초)',
  '구글검색용 좌표',
  'PNU',
  '연면적',
  '대지면적',
  '건축면적',
  '주용도',
  '세부용도',
  '건물명칭',
  '건물동명칭',
  '지상층수',
  '지하층수',
  '오류',
] as const;

function resultToCells(
  input: string,
  status: string,
  result: GpsLookupResult | null,
  error: string,
): (string | number)[] {
  const building = result?.building;
  return [
    input,
    status,
    result?.source ?? '',
    result?.oldAddress ?? '',
    result?.roadAddress ?? '',
    result?.zipcode ?? '',
    result ? result.center.lat : '',
    result ? result.center.lng : '',
    result?.latDms ?? '',
    result?.lngDms ?? '',
    result?.googleCoord ?? '',
    result?.pnu ?? '',
    building?.totalArea ?? '',
    building?.platArea ?? '',
    building?.buildingArea ?? '',
    building?.mainUse ?? '',
    building?.detailUse ?? '',
    building?.name ?? '',
    building?.dongName ?? '',
    building?.groundFloors ?? '',
    building?.basementFloors ?? '',
    error,
  ];
}

function buildDatedFilename(base: string): string {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${base}.xlsx`;
}

/** 일괄 조회 결과를 엑셀로 다운로드한다. */
export function downloadBatchExcel(rows: BatchRow[]): void {
  if (!rows.length) {
    throw new Error('다운로드할 결과가 없습니다.');
  }

  const aoa: (string | number)[][] = [
    [...HEADERS],
    ...rows.map((row) =>
      resultToCells(
        row.input,
        row.status,
        row.result,
        row.error,
      ),
    ),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'gpsmap');
  XLSX.writeFile(workbook, buildDatedFilename('gpsmap_결과'));
}

/** 단건 결과를 엑셀로 다운로드한다. */
export function downloadSingleExcel(result: GpsLookupResult): void {
  downloadBatchExcel([
    {
      index: 0,
      input: result.input,
      status: 'done',
      result,
      error: '',
    },
  ]);
}
