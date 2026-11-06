# Ver_1.1 테스트 케이스 (Test Cases)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 문서 버전: **Ver_1.1**
- 최종 갱신: 2026-07-26
- 관련 문서: [BUSINESS_RULE](./Ver_1.1_BUSINESS_RULE.md) · [USECASE](./Ver_1.1_USECASE.md) · [CODING_GUIDE](./Ver_1.1_CODING_GUIDE.md)

---

## 1. 테스트 레벨

| 레벨 | 도구 | 대상 | 현황 |
| --- | --- | --- | --- |
| 단위 | Vitest | 순수 함수 | **221건 / 15파일** |
| E2E 스모크 | Playwright | 홈 로드 | 1건 |
| 타입 | `tsc --noEmit` | 전체 | 0 오류 |
| 린트 | ESLint | 전체 | 0 문제 |
| 빌드 | `next build` | 전체 | 성공 |
| 수동 | 체크리스트 | UI·통합 | §5 |

> ⚠️ **`vitest`는 타입을 검사하지 않는다.**
> Ver_1.1 검수 시점에 vitest 204건이 통과하는 상태에서 `next build`가 실패했다.
> **릴리스 게이트에 `tsc --noEmit`을 반드시 포함한다.**

## 2. 단위 테스트 현황

| 파일 | 건수 | 대상 |
| --- | --- | --- |
| `worksite-weather/lib/verdict.test.ts` | **45** | 4종 판정·종합·권장시간대·위험요약·특보강도 |
| `worksite-weather/lib/parse-wrn-text.test.ts` | **25** | 특보 텍스트 파싱·지역 매칭 |
| `worksite-weather/lib/site-search.test.ts` | **20** | 국소 검색·어댑터·다중 키워드 |
| `worksite-weather/lib/wind.test.ts` | 17 | 16방위·풍속 등급 |
| `gpsmap/lib/coords.test.ts` | 17 | 좌표 변환 (Ver_1.0) |
| `worksite-weather/lib/kma-base-time.test.ts` | 16 | KST 기준시각 |
| `worksite-weather/lib/merge-sources.test.ts` | 12 | 소스 병합·슬롯 생성 |
| `worksite-weather/lib/parse-amount.test.ts` | 11 | PCP/SNO 문자열 |
| `worksite-weather/lib/apparent-temp.test.ts` | 11 | 체감온도 |
| `map-marker/lib/marker-filters.test.ts` | 9 | 필터 (Ver_1.0) |
| `map-marker/lib/fetch-all-rows.test.ts` | **9** | 페이지네이션 |
| `worksite-weather/lib/worksite-weather-api.test.ts` | **8** | 요청 캐시·중복제거 |
| `worksite-weather/lib/grid.test.ts` | **8** | 격자 변환 |
| `map-marker/components/map/kakao-map-helpers.test.ts` | 8 | 지도 헬퍼 (Ver_1.0) |
| `lib/api/proxy-guard.test.ts` | 5 | origin 가드 (Ver_1.0) |

Ver_1.0 39건 → Ver_1.1 **221건** (신규 182건).

## 3. 안전 판정 테스트 (최우선 도메인)

### 3.1 법정 임계값 경계

| TC | 대상 | 기대 |
| --- | --- | --- |
| TC-W01 | 체감 30.9 / 31 / 32.9 / 33 / 35 / 37.9 / 38℃ | safe / caution / caution / warning / danger / danger / stop |
| TC-W02 | 풍속 3.9 / 4 / 7 / 9.9 / 10 m/s (지상) | safe / caution / warning / warning / stop |
| TC-W03 | 풍속 4 / 7 / 10 m/s (고소) | warning / danger / stop |
| TC-W04 | 고소 + 3.9m/s | **safe** — 무풍까지 올리지 않음 |
| TC-W05 | 강수량 0.99 / 1.0 mm | safe / **stop** |
| TC-W06 | 신적설 1.0 cm | stop |
| TC-W07 | 체감 0 / -0.1 / -5 / -10℃ | safe / caution / warning / stop |

### 3.2 특보 반영 강도 (오경보 방지)

| TC | 입력 | 기대 |
| --- | --- | --- |
| TC-W10 | 호우·강풍·대설·태풍·한파 (주의보/경보) | 전부 **stop** |
| TC-W11 | 폭염 경보·중대경보 | **danger** (stop 아님) |
| TC-W12 | 폭염 주의보 | warning |
| TC-W13 | 열대야 주의보 | caution |
| TC-W14 | 건조·풍랑 경보 | safe (등급 미상승) |
| TC-W15 | 폭염경보 + 호우주의보 | stop (최댓값) |

> TC-W11이 핵심이다. 여름철 전남권은 폭염경보가 상시 발효되므로
> 이것이 stop이 되면 **모든 국소가 ⛔로 표시된다.**

### 3.3 결측 처리

| TC | 상황 | 기대 |
| --- | --- | --- |
| TC-W20 | 단기예보 전체 비어 있음 | 11슬롯 모두 `missing` / `unknown` |
| TC-W21 | 필수 항목 전부 결측 | `verdict: 'unknown'`, 사유 `["예보 결측"]` |
| TC-W22 | 결측 슬롯의 값 | `temp`·`apparent`·`windSpeed`·`pop` 모두 **null** (0 아님) |
| TC-W23 | `unknown`과 실제 등급 비교 | unknown이 실제 등급을 덮지 않음 |

## 4. 기상 데이터 파싱 테스트

### 4.1 기준시각 경계 (KST)

| TC | 조회 시각(KST) | 기대 base |
| --- | --- | --- |
| TC-K01 | 00:05 | 전일 2300 |
| TC-K02 | 02:14 / 02:16 | 전일 2300 / 당일 0200 |
| TC-K03 | 05:14 / 05:16 | 당일 0200 / 당일 0500 |
| TC-K04 | **14:00** | **당일 0500** ← 오전 슬롯 결측 방지 |
| TC-K05 | 23:50 | 당일 0500 |
| TC-K06 | 연말 자정 직후 | 전년 12/31 2300 |
| TC-K07 | UTC 20:00 (= KST 익일 05:00) | KST 날짜로 계산 |

### 4.2 PCP/SNO 문자열

| TC | 원문 | 판정값 |
| --- | --- | --- |
| TC-P01 | `강수없음` / `적설없음` / `""` / null | 0 |
| TC-P02 | `1.0mm 미만` | 0.99 (1mm 기준 미달) |
| TC-P03 | `1.0~29.9mm` | **29.9** (상한) |
| TC-P04 | `30.0~50.0mm` | **50** (상한) |
| TC-P05 | `50.0mm 이상` | 50 |
| TC-P06 | 수치 `2.5` (초단기 RN1) | 2.5 |
| TC-P07 | 표시용 라벨 | 원문 보존 |

### 4.3 소스 병합

| TC | 상황 | 기대 |
| --- | --- | --- |
| TC-M01 | 조회 시각 무관 | 항상 11슬롯 |
| TC-M02 | 12:37 조회 | 07~11 `past`, 12 `vilage` |
| TC-M03 | 실황·초단기·단기 모두 존재 | ncst > ultra > vilage |
| TC-M04 | 초단기 오버레이 | **POP이 지워지지 않음** (초단기엔 POP 없음) |
| TC-M05 | 필요 카테고리 외 | 조기 skip |
| TC-M06 | 다른 날짜 항목 | 제외 |

### 4.4 특보 텍스트 (EUC-KR, 실응답 형식)

| TC | 상황 | 기대 |
| --- | --- | --- |
| TC-A01 | 순천시 폭염경보 | type=폭염, level=경보 |
| TC-A02 | LVL `주의` | **`주의보`** 로 변환 |
| TC-A03 | LVL `중대경보` | 그대로 |
| TC-A04 | CMD `해제`·`취소` | 목록에서 제외 |
| TC-A05 | CMD `발표`·`변경` | 유효 |
| TC-A06 | 도(道) — 다른 시·군 | 제외 |
| TC-A07 | **광역시 — `광주서부` vs `광주광역시 북구`** | **일치** (권역명 미포함) |
| TC-A08 | 경기도 광주시 ↔ 광주광역시 | 상호 제외 |
| TC-A09 | 전남 ↔ 전라남도 | 일치 |
| TC-A10 | 헤더 없음 | 문서상 컬럼 순서로 폴백 |
| TC-A11 | 형식 불일치 | `parsed: false`, 값 생성 안 함 |
| TC-A12 | **주소 미상** | `parsed: false` — 전국 특보 몰아 적용 금지 |

> TC-A07은 실제로 놓쳤던 케이스다. 광주에 폭염경보가 발효 중인데 "특보 없음"으로 표시됐다.

## 5. 인프라 테스트

### 5.1 페이지네이션

| TC | 상황 | 기대 |
| --- | --- | --- |
| TC-F01 | 685행 (상한 이하) | 1회 요청, 685행 |
| TC-F02 | 2,500행 | 3회 요청, 누락 0 |
| TC-F03 | 정확히 2,000행 | 중복 0, 누락 0 |
| TC-F04 | **서버 상한 500** | 전량 수신 (커서가 실제 수신량만큼 이동) |
| TC-F05 | 빈 테이블 | 0행 |
| TC-F06 | count 미제공 | 덜 찬 페이지로 종료 판단 |
| TC-F07 | 1페이지 실패 | throw (부분 결과 금지) |
| TC-F08 | 2페이지 실패 | throw |
| TC-F09 | 서버가 계속 같은 응답 | 50페이지 가드 |

### 5.2 요청 캐시·중복제거

| TC | 상황 | 기대 |
| --- | --- | --- |
| TC-C01 | 같은 국소 3회 | fetch **1회** |
| TC-C02 | 동시 3회 | fetch **1회** (in-flight 병합) |
| TC-C03 | 다른 국소 | 각각 요청 |
| TC-C04 | 실패 후 재시도 | **캐시하지 않음** — 2회 요청 |
| TC-C05 | 평문 500 응답 | `서버 응답 500` 안내 (JSON 파싱 오류 아님) |

## 6. 수동 검증 체크리스트 (릴리스 필수)

### 6.1 날씨 조회

- [ ] 07·12·16시에 각각 조회 → 11슬롯 모두 채워짐
- [ ] 경과 시간대가 회색이되 숨겨지지 않음
- [ ] 현재 시각 슬롯에 "실황" 배지
- [ ] 결측 슬롯이 `—`로 표시 (0이나 빈칸 아님)
- [ ] 판정 사유가 툴팁에 표시

### 6.2 국소 검색

- [ ] 국소명·별칭·주소로 각각 검색
- [ ] `SC-조례` ↔ `sc조례` 동일 결과
- [ ] 쉼표 다중 키워드
- [ ] 좌표 없는 국소 미노출
- [ ] 미등록 주소 → 지오코딩 폴백
- [ ] **목록에서 3번째 선택 후 검색어 수정 → 선택이 유지되거나 명확히 초기화**

### 6.3 표시 일관성

- [ ] 지도 정보창과 사이드바의 **판정 등급 이름이 동일**
- [ ] 타임라인 표에 줄바꿈·가로 스크롤 없음 (사이드바 최소 폭)
- [ ] 고지 문구가 화면·TBM 자료 양쪽에 존재
- [ ] 태풍 미발효 시 배너 DOM 없음

### 6.4 성능

- [ ] 홈 First Load < 350 kB
- [ ] 홈 번들에 xlsx·html2canvas 미포함
- [ ] 지도에서 국소 여러 개 열기 → 같은 국소 재요청 없음
- [ ] TBM 저장 첫 클릭 시 지연 후 정상 저장

### 6.5 회귀 (Ver_1.0 기능)

- [ ] 장비·축전지·위치 3모드 정상
- [ ] **장소 검색(필지 경계) 정상** ← `placeSearch` 회귀 지점
- [ ] 엑셀 업로드·백업·복원 정상
- [ ] 지도 캡처 정상 (html2canvas 지연 로딩 후)
- [ ] 그룹 분리·합치기 정상
- [ ] 백업 왕복 시 `site_alias`·`work_type` 유지

### 6.6 미검증 (Ver_1.2 과제)

- [ ] 위성/레이더 모달 iframe 실렌더
- [ ] 태풍 모달 iframe 실렌더
- [ ] 태풍특보 실발효 상황에서의 배너 동작

## 7. 회귀 스위트 (변경 영역별)

| 변경 영역 | 필수 실행 |
| --- | --- |
| 판정 로직 | `verdict` · `merge-sources` + §6.1 |
| 기상 파싱 | `parse-amount` · `parse-wrn-text` · `kma-base-time` |
| 국소 검색 | `site-search` + §6.2 |
| 데이터 접근 | `fetch-all-rows` + §6.5 |
| 번들·import | `next build` 후 청크 검사 + §6.4 |
| 스토어 | `tsc` + §6.5 전체 |
| 표기 상수 | §6.3 |

## 8. 커버리지 공백

| 영역 | 상태 |
| --- | --- |
| UI 컴포넌트 | ❌ 자동 테스트 없음 (`vitest`가 `.tsx` 미포함) |
| 스토어 액션 | ❌ |
| 지도 오버레이 DOM 빌더 | ❌ |
| 서버 라우트 통합 | △ 수동 curl로만 |
| `kma-client` 실호출 | △ 수동 |
| 외부 iframe | ❌ |

> `.tsx` 테스트를 추가하려면 `vitest.config.ts`의 `include`와 `environment`를 먼저 바꿔야 한다.
