import * as XLSX from 'xlsx';
import {
  FACILITY_TEAM_MAP,
  parseFacilityTeamInput,
  getFacilityTeamExportLabel,
} from './shared';

export const infoRecordMethods: Record<string, any> & ThisType<any> = {

    /**
     * information 행의 시설일·개통일을 yyyy-mm-dd로 정규화합니다.
     * @param {Object} record information 테이블 행 객체
     * @returns {Object} 날짜가 정규화된 행 객체
     */
    normalizeInfoRecord(record) {
        const normalized = {
            ...record,
            install_date: this.formatDateToYmd(record.install_date),
            open_date: this.formatDateToYmd(record.open_date)
        };
        const markerId = String(normalized.marker_id || "").trim();
        if (markerId) {
            normalized.marker_id = markerId;
        } else {
            delete normalized.marker_id;
        }
        return normalized;
    },


    /**
     * markers 목록으로 information.marker_id 조회 인덱스를 만듭니다.
     * @param {Array} markersList markers 테이블 행 또는 앱 마커 객체 배열
     * @returns {{ byId: Map, byFacilityCode: Map, byPlaceName: Map }}
     */
    buildMarkerIndex(markersList) {
        const byId = new Map();
        const byFacilityCode = new Map();
        const byPlaceName = new Map();

        (markersList || []).forEach(marker => {
            const id = String(marker.id || "").trim();
            if (!id) return;

            byId.set(id, id);

            const facilityCode = String(marker.facility_code || marker.facilityCode || "").trim();
            if (facilityCode) {
                byFacilityCode.set(facilityCode, id);
            }

            const name = String(marker.name || "").trim();
            if (name) {
                if (!byPlaceName.has(name)) {
                    byPlaceName.set(name, []);
                }
                byPlaceName.get(name).push(id);
            }
        });

        return { byId, byFacilityCode, byPlaceName };
    },


    /**
     * information 행에 marker_id를 보강합니다.
     * 명시값 → 통합시설코드 → 장소이름(단일 마커) 순으로 연결합니다.
     * @param {Object} record information 행
     * @param {{ byId: Map, byFacilityCode: Map, byPlaceName: Map }} markerIndex
     * @returns {Object} marker_id가 보강된 행
     */
    enrichInfoRecordMarkerId(record, markerIndex) {
        const enriched = { ...record };
        const explicitId = String(record.marker_id || "").trim();

        if (explicitId && markerIndex.byId.has(explicitId)) {
            enriched.marker_id = explicitId;
            return enriched;
        }

        const facilityCode = String(record.facility_code || "").trim();
        if (facilityCode && markerIndex.byFacilityCode.has(facilityCode)) {
            enriched.marker_id = markerIndex.byFacilityCode.get(facilityCode);
            return enriched;
        }

        const placeName = String(record.place_name || "").trim();
        if (placeName && markerIndex.byPlaceName.has(placeName)) {
            const candidates = markerIndex.byPlaceName.get(placeName);
            if (candidates.length === 1) {
                enriched.marker_id = candidates[0];
                return enriched;
            }
        }

        if (explicitId) {
            delete enriched.marker_id;
        }

        return enriched;
    },


    /**
     * information 행 배열에 marker_id를 일괄 보강합니다.
     * @param {Array} records information 행 배열
     * @param {Array} markersList markers 테이블 행 또는 앱 마커 객체 배열
     * @returns {Array}
     */
    enrichInfoRecordsWithMarkerId(records, markersList) {
        const markerIndex = this.buildMarkerIndex(markersList);
        return records.map(record => this.enrichInfoRecordMarkerId(record, markerIndex));
    },


    /**
     * information upsert용 payload를 DB 컬럼만 포함하도록 정제합니다.
     * @param {Object} record information 행
     * @param {{ includeMarkerId?: boolean }} [options]
     * @returns {Object}
     */
    buildInfoUpsertRecord(record, options: { includeMarkerId?: boolean } = {}) {
        const includeMarkerId = options.includeMarkerId !== false;
        const payload: Record<string, string> = {
            facility_code: String(record.facility_code || "").trim(),
            project_code: String(record.project_code || "").trim(),
            facility_year: String(record.facility_year || "").trim(),
            business_type: String(record.business_type || "").trim(),
            place_name: String(record.place_name || "").trim(),
            final_station_name: String(record.final_station_name || "").trim(),
            eq_class: String(record.eq_class || "").trim(),
            eq_type: String(record.eq_type || "").trim(),
            install_date: String(record.install_date || "").trim(),
            open_date: String(record.open_date || "").trim()
        };

        if (!payload.facility_code) {
            throw new Error("통합시설코드가 비어 있습니다.");
        }

        const markerId = String(record.marker_id || "").trim();
        if (includeMarkerId && markerId) {
            payload.marker_id = markerId;
        }

        return payload;
    },


    /**
     * marker_id 관련 DB 오류인지 판별합니다.
     * @param {Object} error Supabase 오류 객체
     * @returns {boolean}
     */
    isInformationMarkerIdError(error) {
        const message = String(error?.message || error?.details || "").toLowerCase();
        const code = String(error?.code || "");
        return (
            code === "PGRST204" ||
            code === "23503" ||
            message.includes("marker_id") ||
            message.includes("foreign key")
        );
    },


    /**
     * information upsert 오류를 사용자 안내 문구로 변환합니다.
     * @param {Object} error Supabase 오류 객체
     * @returns {string}
     */
    translateInformationUpsertError(error) {
        const message = String(error?.message || "");
        const code = String(error?.code || "");

        if (code === "PGRST204" && message.toLowerCase().includes("marker_id")) {
            return "DB에 marker_id 컬럼이 없습니다. Supabase SQL Editor에서 sql/add_equipment_relationships.sql 을 실행하세요.";
        }
        if (code === "23503") {
            return "마커 연결(marker_id)이 올바르지 않습니다. 마커아이디·장소이름·통합시설코드를 확인하세요.";
        }
        if (code === "42501" || message.toLowerCase().includes("permission denied")) {
            return "DB 쓰기 권한이 없습니다. ① 로그아웃 후 다시 로그인 ② Supabase SQL Editor에서 sql/fix_db_write_permissions.sql 실행";
        }
        if (message.toLowerCase().includes("row-level security")) {
            return "DB 보안 정책(RLS)에 의해 저장이 거부되었습니다. 로그인 후 다시 시도하거나 sql/fix_db_write_permissions.sql 을 실행하세요.";
        }
        return message || "알 수 없는 DB 오류";
    },

    /**
     * information 행을 갱신한다.
     * facility_code 에 UNIQUE 가 없으므로 ON CONFLICT upsert 대신
     * marker_id / facility_code 로 기존 행을 update 하고, 없으면 insert 한다.
     * @param {Object} supabase Supabase 클라이언트
     * @param {Array} records 파싱된 information 행 배열
     * @param {Array} markersList markers 테이블 행 또는 앱 마커 객체 배열
     * @returns {Promise<{ count: number, unlinkedCount: number, warning?: string }>}
     */
    async upsertInformationToSupabase(supabase, records, markersList) {
        const enriched = this.enrichInfoRecordsWithMarkerId(
            records.map(row => this.normalizeInfoRecord(row)),
            markersList
        );
        const prepared = enriched.map(row => this.buildInfoUpsertRecord(row, { includeMarkerId: true }));
        const unlinkedCount = prepared.filter(row => !row.marker_id).length;

        let updatedCount = 0;
        let insertedCount = 0;

        for (const row of prepared) {
            const markerId = String(row.marker_id || "").trim();
            const facilityCode = String(row.facility_code || "").trim();

            let existingId = null;

            if (markerId) {
                const { data, error } = await supabase
                    .from("information")
                    .select("id")
                    .eq("marker_id", markerId)
                    .limit(1);
                if (error) {
                    throw new Error(this.translateInformationUpsertError(error));
                }
                existingId = data?.[0]?.id ?? null;
            }

            if (existingId == null && facilityCode) {
                const { data, error } = await supabase
                    .from("information")
                    .select("id")
                    .eq("facility_code", facilityCode)
                    .limit(1);
                if (error) {
                    throw new Error(this.translateInformationUpsertError(error));
                }
                existingId = data?.[0]?.id ?? null;
            }

            if (existingId != null) {
                const { error } = await supabase
                    .from("information")
                    .update(row)
                    .eq("id", existingId);
                if (error) {
                    throw new Error(this.translateInformationUpsertError(error));
                }
                updatedCount += 1;
                continue;
            }

            const { error } = await supabase.from("information").insert(row);
            if (error) {
                throw new Error(this.translateInformationUpsertError(error));
            }
            insertedCount += 1;
        }

        return {
            count: updatedCount + insertedCount,
            unlinkedCount,
            warning:
                insertedCount > 0
                    ? `신규 information ${insertedCount}건 추가 · 갱신 ${updatedCount}건`
                    : undefined,
        };
    },
};
