import * as XLSX from 'xlsx';
import {
  FACILITY_TEAM_MAP,
  parseFacilityTeamInput,
  getFacilityTeamExportLabel,
} from './shared';

export const exportMethods: Record<string, any> & ThisType<any> = {

    /**
     * 마커 데이터를 CSV 형식의 문자열로 변환하고 다운로드합니다.
     * @param {Array} markers 저장된 마커 배열
     */
    exportToCSV(markers) {
        if (!markers || markers.length === 0) {
            throw new Error("내보낼 마커 데이터가 없습니다.");
        }

        // CSV 헤더 정의
        const headers = ["아이디", "장소 이름", "위도", "경도", "메모", "태그", "등록일"];
        
        // 데이터 행 변환
        const rows = markers.map(marker => {
            const id = marker.id || "";
            // 쌍따옴표 내의 데이터에 쌍따옴표가 있을 경우 이중 처리
            const name = (marker.name || "").replace(/"/g, '""');
            
            // [정확성 최우선] 위도와 경도는 소수점 자릿수 자르지 않고 문자열로 안전하게 보존
            const lat = typeof marker.lat === 'number' ? marker.lat.toString() : (marker.lat || "0");
            const lng = typeof marker.lng === 'number' ? marker.lng.toString() : (marker.lng || "0");
            
            const memo = (marker.memo || "").replace(/"/g, '""').replace(/\r?\n/g, " "); // 줄바꿈은 공백으로 치환
            const tags = (marker.tags || []).join(", ").replace(/"/g, '""');
            const date = marker.createdAt || "";

            return `"${id}","${name}",${lat},${lng},"${memo}","${tags}","${date}"`;
        });

        // BOM 추가 (UTF-8 한글 깨짐 방지)
        const csvContent = "\ufeff" + [headers.join(","), ...rows].join("\n");
        
        // 다운로드 실행
        this._triggerDownload(csvContent, "map_markers.csv", "text/csv;charset=utf-8;");
        
        // 검산 목적의 리턴값
        return {
            rowCount: rows.length,
            totalMarkers: markers.length
        };
    },


    /**
     * 마커 백업용 Excel(.xlsx) 파일로보냅니다.
     * Excel 백업과 동일한 필드를 고정 열 헤더로 보존합니다.
     * @param {Array} markers 저장된 마커 배열
     * @param {string} [filename] 다운로드 파일명
     * @returns {number}보낸 행 수
     */
    exportMarkersToExcel(markers, filename) {
        if (!markers || markers.length === 0) {
            throw new Error("백업할 마커 데이터가 없습니다.");
        }

        const rows = markers.map(marker => ({
            "아이디": marker.id || "",
            "장소 이름": marker.name || "",
            "위도": typeof marker.lat === "number" ? marker.lat.toString() : (marker.lat || ""),
            "경도": typeof marker.lng === "number" ? marker.lng.toString() : (marker.lng || ""),
            "메모": marker.memo || "",
            "태그": Array.isArray(marker.tags) ? marker.tags.join(", ") : "",
            "시설팀": getFacilityTeamExportLabel(marker.facilityTeam),
            "마커색상": marker.facilityTeam ? (FACILITY_TEAM_MAP[marker.facilityTeam]?.color || marker.color || "#10b981") : (marker.color || "#10b981"),
            "통합시설코드": marker.facilityCode || "",
            "도로명주소": marker.roadAddress || "",
            "지번주소": marker.jibunAddress || "",
            "등록일": marker.createdAt || ""
        }));

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "markers");

        const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        const dateStr = new Date().toISOString().split("T")[0];
        this._triggerDownloadBuffer(
            buffer,
            filename || `supabase_markers_backup_${dateStr}.xlsx`,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        return rows.length;
    },


    /**
     * information 테이블 백업용 Excel(.xlsx) 파일로보냅니다.
     * @param {Array} infoList information 테이블 행 배열
     * @param {string} [filename] 다운로드 파일명
     * @returns {number}보낸 행 수
     */
    exportInfoToExcel(infoList, filename) {
        if (!infoList || infoList.length === 0) {
            throw new Error("백업할 상세 장비 데이터가 없습니다.");
        }

        const rows = infoList.map(row => ({
            "통합시설코드": row.facility_code || "",
            "마커아이디": row.marker_id || "",
            "프로젝트코드": row.project_code || "",
            "시설연도": row.facility_year || "",
            "사업구분": row.business_type || "",
            "장소이름": row.place_name || "",
            "국소명-최종": row.final_station_name || "",
            "장비분류": row.eq_class || "",
            "장비타입": row.eq_type || "",
            "시설일": this.formatDateToYmd(row.install_date),
            "개통일": this.formatDateToYmd(row.open_date)
        }));

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "information");

        const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        const dateStr = new Date().toISOString().split("T")[0];
        this._triggerDownloadBuffer(
            buffer,
            filename || `supabase_information_backup_${dateStr}.xlsx`,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        return rows.length;
    },


    /**
     * 축전지 데이터를 백업용 Excel(.xlsx) 파일로 내보냅니다.
     */
    exportBatteryMarkersToExcel(markers, filename) {
        if (!markers || markers.length === 0) {
            throw new Error("백업할 마커 데이터가 없습니다.");
        }

        const rows = [];
        markers.forEach(marker => {
            const items = marker.items && marker.items.length > 0 ? marker.items : [{
                erpName: marker.memo || "",
                capacity: marker.capacity || 600,
                quantity: marker.quantity || 12,
                stationName: marker.stationName || marker.name,
                address: marker.address || "",
                createdAt: marker.createdAt || ""
            }];

            items.forEach(item => {
                rows.push({
                    "통합시설명칭(ERP)": item.erpName || marker.memo || "",
                    "주소": item.address || marker.address || "",
                    "용량(AH)": item.capacity || 600,
                    "수량(Cell)": item.quantity || 12,
                    "창고/국소/국사명": item.stationName || marker.name || "",
                    "위도": typeof marker.lat === "number" ? marker.lat.toString() : (marker.lat || ""),
                    "경도": typeof marker.lng === "number" ? marker.lng.toString() : (marker.lng || ""),
                    "메모": marker.memo || "",
                    "태그": Array.isArray(marker.tags) ? marker.tags.join(", ") : "",
                    "시설팀": getFacilityTeamExportLabel(marker.facilityTeam),
                    "마커색상": marker.facilityTeam ? (FACILITY_TEAM_MAP[marker.facilityTeam]?.color || marker.color || "#64748b") : (marker.color || "#64748b"),
                    "등록일": item.createdAt || marker.createdAt || ""
                });
            });
        });

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "battery_markers");

        const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        const dateStr = new Date().toISOString().split("T")[0];
        this._triggerDownloadBuffer(
            buffer,
            filename || `battery_markers_backup_${dateStr}.xlsx`,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );

        return rows.length;
    },


    /**
     * 브라우저에서 ArrayBuffer 기반 다운로드를 실행시키는 헬퍼 메서드
     * @private
     */
    _triggerDownloadBuffer(buffer, filename, mimeType) {
        const blob = new Blob([buffer], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },


    /**
     * 브라우저에서 다운로드를 실행시키는 헬퍼 메서드
     * @private
     */
    _triggerDownload(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
};
