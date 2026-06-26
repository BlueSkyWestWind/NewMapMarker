/**
 * MapMarker Pro — Excel 업로드 양식 생성 스크립트
 * 실행: node scripts/generate-excel-templates.js
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const OUT_DIR = path.join(__dirname, '..', 'templates');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function writeWorkbook(filename, sheets) {
    const workbook = XLSX.utils.book_new();
    sheets.forEach(({ name, rows }) => {
        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(workbook, worksheet, name);
    });
    const outPath = path.join(OUT_DIR, filename);
    XLSX.writeFile(workbook, outPath);
    console.log('생성:', outPath);
}

// ------------------------------------------------------------
// 1. 엑셀로 위치 찍기 (장비) — data-manager.parseExcelOrCSV 기준
// ------------------------------------------------------------
const locationHeaders = [
    '장소 이름',
    '위도',
    '경도',
    '주소',
    '메모',
    '태그',
    '통합시설코드',
    '프로젝트코드',
    '시설연도',
    '사업구분',
    '국소명-최종',
    '장비분류',
    '장비타입',
    '시설일',
    '개통일',
    '시설팀',
    '마커색상'
];

const locationSamples = [
    [
        '광주광역시청',
        35.159542,
        126.8526012,
        '광주광역시 서구 내방로 111',
        '예시 메모',
        '기지국,점검',
        '2026000001',
        'PJ-2026-001',
        '2026',
        '신설',
        '광주시청국',
        'RU',
        'LTE',
        '2026-01-15',
        '2026-03-01',
        '1팀(박경훈)',
        ''
    ],
    [
        '○○기지국',
        '',
        '',
        '광주광역시 ○○구 ○○로 123',
        '주소만 있으면 좌표 자동 변환',
        '',
        '2026000002',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        ''
    ]
];

const locationGuide = [
    ['엑셀로 위치 찍기 (장비) — 작성 안내'],
    [''],
    ['필수'],
    ['· 장소 이름 — 반드시 입력'],
    ['· 위치 — (위도 + 경도) 또는 주소 중 하나 이상'],
    [''],
    ['선택'],
    ['· 메모, 태그(쉼표 구분), 통합시설코드, 프로젝트코드, 시설연도, 사업구분'],
    ['· 국소명-최종, 장비분류, 장비타입, 시설일, 개통일 (yyyy-mm-dd)'],
    ['· 시설팀 — 1팀(박경훈), 2팀(김정배) 등 / 마커색상 — #10b981 형식'],
    [''],
    ['주의'],
    ['· 첫 행(헤더) 이름을 변경하지 마세요'],
    ['· 위도·경도는 소수 그대로 입력 (반올림 금지)'],
    ['· 업로드 후 앱에서 확인·일괄등록']
];

// ------------------------------------------------------------
// 2. 상세장비정보 업로드 — data-manager.parseInfoExcel 기준
// ------------------------------------------------------------
const infoHeaders = [
    '통합시설코드',
    '마커아이디',
    '프로젝트코드',
    '시설연도',
    '사업구분',
    '장소이름',
    '국소명-최종',
    '장비분류',
    '장비타입',
    '시설일',
    '개통일'
];

const infoSamples = [
    [
        '2026000001',
        'marker_example_001',
        'PJ-2026-001',
        '2026',
        '신설',
        '광주광역시청',
        '광주시청국',
        'RU',
        'LTE',
        '2026-01-15',
        '2026-03-01'
    ],
    [
        '2026000002',
        '',
        'PJ-2026-002',
        '2025',
        '교체',
        '○○기지국',
        '○○국',
        'DU',
        '5G',
        '2025-06-20',
        '2025-08-10'
    ]
];

const infoGuide = [
    ['상세장비정보 업로드 — 작성 안내'],
    [''],
    ['필수'],
    ['· 통합시설코드 — 파일 내 중복 불가 (PK)'],
    [''],
    ['선택'],
    ['· 마커아이디 — markers.id (백업 파일에서 복사 가능)'],
    ['· 프로젝트코드, 시설연도, 사업구분, 장소이름'],
    ['· 국소명-최종, 장비분류, 장비타입, 시설일, 개통일 (yyyy-mm-dd)'],
    [''],
    ['연동'],
    ['· 마커아이디가 없으면 통합시설코드·장소이름으로 markers 와 자동 연결'],
    ['· 장소이름은 지도 마커 이름과 같으면 자동 연결됩니다'],
    ['· 위경도 없이 상세 정보만 Supabase information 테이블에 저장'],
    [''],
    ['주의'],
    ['· 첫 행(헤더) 이름을 변경하지 마세요'],
    ['· 통합시설코드가 비어 있는 행은 무시됩니다']
];

ensureDir(OUT_DIR);

writeWorkbook('장비_엑셀위치찍기_양식.xlsx', [
    { name: '데이터', rows: [locationHeaders, ...locationSamples] },
    { name: '작성안내', rows: locationGuide }
]);

writeWorkbook('상세장비정보_업로드_양식.xlsx', [
    { name: '데이터', rows: [infoHeaders, ...infoSamples] },
    { name: '작성안내', rows: infoGuide }
]);
