
/**
 * DataManager - 데이터 내보내기/가져오기 및 정밀도 보존 모듈
 * 
 * [정확성 규칙 준수]
 * 1. 위도/경도 좌표의 소수점 값을 버림/반올림 없이 원본 그대로 보존합니다.
 * 2. Excel 한글 깨짐 방지를 위해 UTF-8 BOM(\ufeff) 인코딩을 적용합니다.
 * 3. 빈 값(메모 없음 등)을 명시적으로 공백 문자열("")로 처리하여 칸이 밀리는 현상을 방지합니다.
 */
export const FACILITY_TEAM_MAP = {
    '1': { label: '1팀(박경훈)', color: '#2563eb' },
    '2': { label: '2팀(김정배)', color: '#d946ef' },
    '3': { label: '3팀(정종연)', color: '#84cc16' },
    '4': { label: '4팀(이동화)', color: '#9333ea' },
    '5': { label: '5팀(김영남)', color: '#ea580c' },
    '7': { label: '7팀(김성범)', color: '#0891b2' }
};

export function parseFacilityTeamInput(rawValue) {
    const val = String(rawValue || '').trim();
    if (!val) {
        return { facilityTeam: '', color: '#64748b' };
    }
    for (const [id, team] of Object.entries(FACILITY_TEAM_MAP)) {
        if (val === id || val === team.label || val.startsWith(`${id}팀`)) {
            return { facilityTeam: id, color: team.color };
        }
    }
    return { facilityTeam: '', color: '#64748b' };
}

export function getFacilityTeamExportLabel(teamId) {
    return FACILITY_TEAM_MAP[teamId]?.label || '';
}
