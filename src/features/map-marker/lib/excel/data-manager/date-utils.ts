import * as XLSX from 'xlsx';
import {
  FACILITY_TEAM_MAP,
  parseFacilityTeamInput,
  getFacilityTeamExportLabel,
} from './shared';

export const dateUtilMethods: Record<string, any> & ThisType<any> = {
    /**
     * 지정한 연도, 월, 일이 유효한 달력상 날짜이며 1980년 ~ (현재년도 + 10년) 범위 내에 있는지 확인합니다.
     * @param {string|number} y 연도
     * @param {string|number} m 월
     * @param {string|number} d 일
     * @returns {boolean} 유효 여부
     */
    isValidDateRange(y, m, d) {
        const year = parseInt(y, 10);
        const month = parseInt(m, 10);
        const day = parseInt(d, 10);
        const currentYear = new Date().getFullYear();
        if (isNaN(year) || isNaN(month) || isNaN(day)) return false;
        if (year < 1980 || year > currentYear + 10) return false;
        if (month < 1 || month > 12) return false;
        if (day < 1 || day > 31) return false;

        const date = new Date(year, month - 1, day);
        return date.getFullYear() === year && (date.getMonth() + 1) === month && date.getDate() === day;
    },


    /**
     * 날짜 값을 yyyy-mm-dd 문자열로 정규화합니다.
     * Excel 직렬값·다양한 구분자·ISO 문자열을 지원하며, 과잉 매핑을 방어합니다.
     * @param {string|number|Date|null|undefined} value 원본 날짜 값
     * @returns {string} yyyy-mm-dd 또는 빈 문자열
     */
    formatDateToYmd(value) {
        if (value === null || value === undefined) return "";
        if (value instanceof Date) {
            if (isNaN(value.getTime())) return "";
            const yyyy = value.getFullYear();
            const mm = value.getMonth() + 1;
            const dd = value.getDate();
            if (this.isValidDateRange(yyyy, mm, dd)) {
                return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
            }
            return "";
        }

        const str = String(value).trim();
        if (!str) return "";

        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            const parts = str.split("-");
            if (this.isValidDateRange(parts[0], parts[1], parts[2])) {
                return str;
            }
        }

        const isoPrefix = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoPrefix && this.isValidDateRange(isoPrefix[1], isoPrefix[2], isoPrefix[3])) {
            return `${isoPrefix[1]}-${isoPrefix[2]}-${isoPrefix[3]}`;
        }

        const separated = str.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
        if (separated && this.isValidDateRange(separated[1], separated[2], separated[3])) {
            return `${separated[1]}-${separated[2].padStart(2, "0")}-${separated[3].padStart(2, "0")}`;
        }

        const shortYear = str.match(/^(\d{2})-(\d{2})-(\d{2})$/);
        if (shortYear) {
            const yearNum = parseInt(shortYear[1], 10);
            const fullYear = yearNum >= 50 ? 1900 + yearNum : 2000 + yearNum;
            if (this.isValidDateRange(fullYear, shortYear[2], shortYear[3])) {
                return `${fullYear}-${shortYear[2]}-${shortYear[3]}`;
            }
        }

        const digits = str.replace(/[^0-9]/g, "");
        if (digits.length === 8) {
            const y = digits.substring(0, 4);
            const m = digits.substring(4, 6);
            const d = digits.substring(6, 8);
            if (this.isValidDateRange(y, m, d)) {
                return `${y}-${m}-${d}`;
            }
        }

        const serial = parseFloat(str);
        if (!isNaN(serial) && serial > 20000 && serial < 100000 && !/[./-]/.test(str)) {
            const utcDays = Math.floor(serial - 25569);
            const dateFromSerial = new Date(utcDays * 86400 * 1000);
            if (!isNaN(dateFromSerial.getTime())) {
                const year = dateFromSerial.getFullYear();
                const currentYear = new Date().getFullYear();
                if (year >= 1980 && year <= currentYear + 10) {
                    return this.formatDateToYmd(dateFromSerial);
                }
            }
        }

        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) {
            const yyyy = parsed.getFullYear();
            const mm = parsed.getMonth() + 1;
            const dd = parsed.getDate();
            if (this.isValidDateRange(yyyy, mm, dd)) {
                return this.formatDateToYmd(parsed);
            }
        }

        return str;
    },
};
