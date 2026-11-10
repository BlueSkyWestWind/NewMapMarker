import * as XLSX from 'xlsx';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildFullBackupSheetRows,
  fullBackupMethods,
  parseErpStyleBackupToTables,
  type FullBackupTables,
} from './full-backup';

type Methods = {
  exportFullBackupToExcel: (t: FullBackupTables, name?: string) => unknown;
  parseFullBackupExcel: (file: File) => Promise<FullBackupTables>;
  _triggerDownloadBuffer?: (buffer: ArrayBuffer) => void;
};
const methods = fullBackupMethods as unknown as Methods;

// vitest 기본 환경(node)에는 FileReader가 없어 파서가 쓰는 최소 부분만 흉내 낸다.
beforeAll(() => {
  class FakeFileReader {
    onload: ((event: { target: { result: ArrayBuffer } }) => void) | null = null;
    onerror: (() => void) | null = null;
    readAsArrayBuffer(file: File) {
      void file.arrayBuffer().then((result) => this.onload?.({ target: { result } }));
    }
  }
  (globalThis as unknown as { FileReader: unknown }).FileReader = FakeFileReader;
});

const tables: FullBackupTables = {
  markers: [{ id: 'm1', name: '장비국소', lat: 35.1, lng: 126.1, color: '#10b981', created_at: '2026-01-01' }],
  information: [],
  erp_details: [{ id: 'e1', marker_id: 'm1', facility_code: '202600001', raw: { 프로젝트: 'L.C262.55.0001', 통합시설코드: '202600001', '국소명-최종': '장비국소' } }],
  battery_markers: [{ id: 'b1', name: '축전지국소', lat: 35.2, lng: 126.2, address: '광주', created_at: '2026-01-02' }],
  battery_specs: [{ id: 's1', marker_id: 'b1', erp_name: '축전지국소', capacity: 600, quantity: 1 }],
};

function exportWorkbook() {
  let captured: ArrayBuffer | null = null;
  const self: Methods = {
    ...methods,
    _triggerDownloadBuffer: (buffer: ArrayBuffer) => {
      captured = buffer;
    },
  };
  self.exportFullBackupToExcel(tables);
  return XLSX.read(captured!, { type: 'array' });
}

describe('전체 백업 시트 분리', () => {
  it('장비 시트에는 축전지 행이 없다', () => {
    const rows = buildFullBackupSheetRows(tables);
    expect(rows).toHaveLength(1);
    expect(rows.some((row) => '테이블' in row)).toBe(false);
  });

  it('축전지 마커·규격은 각자 시트로 나온다', () => {
    const wb = exportWorkbook();
    expect(wb.SheetNames).toEqual(['mapmarker_backup', '축전지', '축전지규격']);
    const markers = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['축전지']);
    const specs = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['축전지규격']);
    expect(markers).toHaveLength(1);
    expect(markers[0].name).toBe('축전지국소');
    expect(specs).toHaveLength(1);
    expect(specs[0].capacity).toBe(600);
  });

  it('분리된 백업을 다시 읽으면 축전지 데이터가 복원된다', async () => {
    const wb = exportWorkbook();
    const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const file = new File([bytes], 'backup.xlsx');
    const restored = await methods.parseFullBackupExcel(file);
    expect(restored.battery_markers).toHaveLength(1);
    expect(restored.battery_markers[0].name).toBe('축전지국소');
    expect(restored.battery_specs).toHaveLength(1);
    expect(restored.battery_specs[0].quantity).toBe(1);
  });
});

describe('공정관리 형식 백업 — 주소를 지번/도로명 칸으로 나눠 저장한다', () => {
  async function parse(addresses: string[]) {
    const aoa = [
      ['통합시설코드', '국소명-최종', '주소(전체)'],
      ...addresses.map((address, index) => [`C${index}`, `국소${index}`, address]),
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), '일정관리');
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    return parseErpStyleBackupToTables(new File([data], 'erp.xlsx'));
  }

  it('지번 주소는 jibun_address 칸에 넣고 road_address는 비운다', async () => {
    const { markers } = await parse(['전남광주통합특별시 북구 삼각동 700번지']);
    expect(markers[0]).toMatchObject({
      jibun_address: '전남광주통합특별시 북구 삼각동 700번지',
      road_address: '',
    });
  });

  it('도로명 주소는 road_address 칸에 넣고 jibun_address는 비운다', async () => {
    const { markers } = await parse(['광주광역시 북구 첨단과기로 123']);
    expect(markers[0]).toMatchObject({
      road_address: '광주광역시 북구 첨단과기로 123',
      jibun_address: '',
    });
  });

  it('산 번지 표기도 지번으로 본다', async () => {
    const { markers } = await parse(['전남광주통합특별시 화순군 춘양면 우봉리 산30-1']);
    expect(markers[0]).toMatchObject({
      jibun_address: '전남광주통합특별시 화순군 춘양면 우봉리 산30-1',
      road_address: '',
    });
  });
});
