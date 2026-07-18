import * as XLSX from 'xlsx';
import {
  FACILITY_TEAM_MAP,
  parseFacilityTeamInput,
  getFacilityTeamExportLabel,
} from './shared';

export const headerMethods: Record<string, any> & ThisType<any> = {

    /**
     * 상세 장비 Excel 워크북에서 데이터 시트를 찾습니다.
     * @param {Object} workbook XLSX 워크북
     * @returns {Object} 워크시트
     */
    resolveInfoExcelSheet(workbook) {
        const preferredNames = ["데이터", "data", "information", "Information"];
        for (const name of preferredNames) {
            if (workbook.SheetNames.includes(name)) {
                return workbook.Sheets[name];
            }
        }

        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const probe = XLSX.utils.sheet_to_json<any[]>(worksheet, { defval: "", header: 1, range: 0 });
            const headerRow = (probe[0] || []).map(cell => String(cell).trim());
            if (headerRow.some(header => /통합시설코드|시설코드/i.test(header))) {
                return worksheet;
            }
        }

        return workbook.Sheets[workbook.SheetNames[0]];
    },


    /**
     * 헤더 배열에서 정확한 이름 우선으로 열 키를 찾습니다.
     * @param {Array<string>} headers
     * @param {Array<string>} exactNames
     * @param {RegExp} [fallbackRegex]
     * @returns {string|undefined}
     */
    findHeaderByNames(headers, exactNames, fallbackRegex) {
        const trimmedHeaders = headers.map(header => String(header).trim());
        for (const exactName of exactNames) {
            const index = trimmedHeaders.findIndex(header => header === exactName);
            if (index !== -1) {
                return headers[index];
            }
        }
        if (fallbackRegex) {
            return headers.find(header => fallbackRegex.test(String(header).trim()));
        }
        return undefined;
    },


    /**
     * 상세 장비 Excel 헤더 매핑을 생성합니다.
     * @param {Array<string>} headers
     * @returns {Object}
     */
    resolveInfoHeaderMapping(headers) {
        return {
            facilityCode: this.findHeaderByNames(headers, ["통합시설코드", "시설코드"], /통합시설코드|시설코드|facility.*code/i),
            markerId: this.findHeaderByNames(headers, ["마커아이디", "marker_id"], /마커.*아이디|마커id|marker.*id/i),
            projectCode: this.findHeaderByNames(headers, ["프로젝트코드"], /프로젝트코드|프로젝트|project/i),
            facilityYear: this.findHeaderByNames(headers, ["시설연도", "시설년도"], /시설연도|시설년도|연도|year/i),
            businessType: this.findHeaderByNames(headers, ["사업구분"], /사업구분|사업|business/i),
            placeName: this.findHeaderByNames(headers, ["장소이름", "장소 이름", "장소명"], /장소.*이름|장소명/i),
            finalStationName: this.findHeaderByNames(headers, ["국소명-최종", "국소명_최종"], /국소명.*최종|국소명-최종|국소명_최종/i),
            eqClass: this.findHeaderByNames(headers, ["장비분류"], /장비분류/i),
            eqType: this.findHeaderByNames(headers, ["장비타입"], /장비타입|타입/i),
            installDate: this.findHeaderByNames(headers, ["시설일"], /시설일|설치일|install/i),
            openDate: this.findHeaderByNames(headers, ["개통일", "가동일"], /개통일|개통|가동일|가동|open/i)
        };
    },


    /**
     * 안내 문구 행인지 판별합니다.
     * @param {string} facilityCodeValue
     * @returns {boolean}
     */
    isInfoGuideRow(facilityCodeValue) {
        const code = String(facilityCodeValue || "").trim();
        if (!code) {
            return true;
        }
        return /^(통합시설코드|시설코드|작성|안내|필수|선택|주의|예시)/i.test(code)
            || code.includes("작성 안내")
            || code.includes("yyyy-mm-dd");
    },
};
