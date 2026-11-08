import * as XLSX from 'xlsx';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildFullBackupSheetRows, fullBackupMethods, type FullBackupTables } from './full-backup';

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
