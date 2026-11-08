import { describe, expect, it } from 'vitest';
import type { FullBackupTables } from './full-backup-schema';
import { splitBackupForLocationReview } from './full-backup-split';

function tables(markers: Record<string, unknown>[]): FullBackupTables {
  return {
    markers,
    information: markers.map((m) => ({ marker_id: m.id })),
    erp_details: markers.map((m) => ({ marker_id: m.id })),
    battery_markers: [{ id: 'b1' }],
    battery_specs: [],
  };
}

describe('splitBackupForLocationReview', () => {
  const located = { id: 'a', lat: 35.1, lng: 126.1, facility_code: '1', road_address: '광주' };
  const needsReview = { id: 'b', lat: null, lng: null, facility_code: '2', road_address: '광주 남구 1' };
  const noAddress = { id: 'c', lat: null, lng: null, facility_code: '3', road_address: '' };
  const noCode = { id: 'd', lat: null, lng: null, facility_code: null, road_address: '광주 2' };
  const placeholderAddress = { id: 'e', lat: '', lng: '', facility_code: '5', road_address: '불필요' };

  it('좌표 없음 + 주소 + 코드가 있는 행만 위치 확인으로 넘기고 DB 복원에서 뺀다', () => {
    const split = splitBackupForLocationReview(tables([located, needsReview]));
    expect([...split.deferredFacilityCodes]).toEqual(['2']);
    expect(split.deferredCount).toBe(1);
    expect(split.restore.markers.map((m) => m.id)).toEqual(['a']);
    expect(split.restore.information.map((m) => m.marker_id)).toEqual(['a']);
    expect(split.restore.erp_details.map((m) => m.marker_id)).toEqual(['a']);
    expect(split.restore.battery_markers).toHaveLength(1);
  });

  it('주소나 코드가 없어 확인할 수 없는 행은 그대로 복원하고 개수만 센다', () => {
    const split = splitBackupForLocationReview(
      tables([noAddress, noCode, placeholderAddress]),
    );
    expect(split.deferredFacilityCodes.size).toBe(0);
    expect(split.unlocatableCount).toBe(3);
    expect(split.restore.markers).toHaveLength(3);
  });

  it('위도·경도가 0,0이거나 숫자가 아니면 좌표 없음으로 본다', () => {
    const zero = { ...needsReview, id: 'z', lat: 0, lng: 0, facility_code: '9' };
    expect([...splitBackupForLocationReview(tables([zero])).deferredFacilityCodes]).toEqual(['9']);
  });

  it('대상이 없으면 입력을 그대로 돌려준다', () => {
    const input = tables([located]);
    expect(splitBackupForLocationReview(input).restore).toBe(input);
  });

  it('통합시설코드가 겹치면 코드 수보다 마커 수가 많다', () => {
    const twin = { ...needsReview, id: 'b2' };
    const split = splitBackupForLocationReview(tables([needsReview, twin]));
    expect(split.deferredFacilityCodes.size).toBe(1);
    expect(split.deferredCount).toBe(2);
  });
});
