import { dateUtilMethods } from './date-utils';
import { infoRecordMethods } from './info-records';
import { headerMethods } from './headers';
import { parseMethods } from './parse';
import { exportMethods } from './export';

/**
 * 데이터 내보내기/가져오기 및 정밀도 보존 모듈.
 * 원본 단일 파일(data-manager.ts, 1,145줄)을 기능별로 분할해 합성한다.
 * this 로 상호 호출하므로 하나의 객체로 합쳐야 동작한다.
 */
export const MapMarkerExcelManager: Record<string, any> = {
  ...dateUtilMethods,
  ...infoRecordMethods,
  ...headerMethods,
  ...parseMethods,
  ...exportMethods,
};

export default MapMarkerExcelManager;
