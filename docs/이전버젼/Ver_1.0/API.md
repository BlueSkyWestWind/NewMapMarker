# API 문서 (API Contract)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 문서 버전: **Ver_1.0**
- 최종 갱신: 2026-07-25
- 관련 문서: [ARCHITECTURE](./ARCHITECTURE.md) · [DATABASE](./DATABASE.md) · [BUSINESS_RULE §8](./BUSINESS_RULE.md)

> MapMarker Pro는 공개 API를 제공하지 않는다. 아래 라우트는 **자기 앱 전용 서버 프록시**이며 origin 가드로 보호된다.

---

## 1. 인터페이스 개요

| 구분 | 대상 | 방식 |
| --- | --- | --- |
| 내부 Route Handler | 3종 (`/api/*`) | 브라우저 → 자기 서버 → 외부 |
| 데이터 접근 | Supabase | 브라우저 → Supabase (anon 키 + RLS) |
| 지도 SDK | Kakao Maps JS | 브라우저 직접 |
| 좌표 변환 | VWorld (GPSMAP) | 브라우저 직접 |

## 2. 공통 규약

### 2.1 Origin 가드 (전 라우트 공통)

```
허용 origin = 자기 도메인
            + NEXT_PUBLIC_SITE_URL
            + PROXY_ALLOWED_ORIGINS (쉼표 구분)
```

| 상황 | 응답 |
| --- | --- |
| 허용 origin | 정상 처리 |
| 그 외 origin | **403 Forbidden** |

### 2.2 공통 오류 형식

```json
{ "error": "사람이 읽을 수 있는 한국어 메시지" }
```

| 상태 | 의미 |
| --- | --- |
| 400 | 필수 파라미터 누락 / 형식 오류 |
| 403 | origin 불허 · **호스트 allowlist 위반** |
| 404 | 대상 리소스 없음 |
| 502 | 업스트림(카카오 등) 응답 실패 |

### 2.3 보안 불변식

| ID | 규칙 |
| --- | --- |
| API-S1 | `KAKAO_REST_API_KEY`는 **서버에서만** 읽는다. 응답 본문·헤더에 노출하지 않는다 |
| API-S2 | 타일 프록시는 **호스트 allowlist**만 통과시킨다(SSRF 방어) |
| API-S3 | 업스트림 오류 메시지를 그대로 전달하지 않는다(키·내부 URL 유출 방지) |
| API-S4 | 사용자 입력 URL을 그대로 fetch하지 않는다. 반드시 파싱 후 호스트를 검증한다 |

## 3. `/api/kakao-static-map`

카카오 정적맵 이미지를 대리 요청한다. **영역 격자 캡처의 1순위 소스**.

| 항목 | 값 |
| --- | --- |
| 메서드 | `GET` |
| 인증 | origin 가드 |
| 응답 | 이미지 바이너리 (`image/png` 또는 `image/jpeg`) |

**쿼리 파라미터**

| 이름 | 필수 | 설명 |
| --- | :---: | --- |
| 중심 좌표 (lat/lng) | ● | 캡처 격자 셀의 중심 |
| level | ● | 지도 레벨 |
| width / height | ● | 요청 이미지 크기 |

**키 선택 순서**

```
1. KAKAO_REST_API_KEY 존재 → REST 키로 요청
2. 없으면 → JS 키로 시도
3. 그래도 실패 → 호출측이 /api/map-tile-proxy 로 폴백  (BR-P01)
```

**오류**

| 상태 | 원인 |
| --- | --- |
| 400 | 좌표·레벨·크기 누락 또는 범위 밖 |
| 403 | origin 불허 |
| 502 | 카카오 응답 실패 → 클라이언트는 타일 폴백 수행 |

## 4. `/api/map-tile-proxy`

지도 타일을 대리 요청한다. **캡처 폴백 경로**.

| 항목 | 값 |
| --- | --- |
| 메서드 | `GET` |
| 인증 | origin 가드 + **호스트 allowlist** |
| 응답 | 타일 이미지 바이너리 |

**쿼리 파라미터**

| 이름 | 필수 | 설명 |
| --- | :---: | --- |
| 타일 URL | ● | 요청할 타일 주소. **호스트가 allowlist에 있어야 함** |

**allowlist 검증 흐름**

```
입력 URL
 → URL 파싱 (실패 시 400)
 → 프로토콜 검사 (https 만 허용)
 → 호스트가 allowlist에 포함되는가?
     ├ YES → 업스트림 fetch → 바이너리 반환
     └ NO  → 403 (SSRF 차단)
```

검증 구현: `proxy-guard` (**단위 테스트 보유** — NFR-01)

> 신규 타일 호스트를 추가할 때는 **allowlist와 `proxy-guard` 테스트를 함께** 갱신한다.

## 5. `/api/roadview-dates`

특정 좌표의 로드뷰 촬영일자를 조회한다.

| 항목 | 값 |
| --- | --- |
| 메서드 | `GET` |
| 인증 | origin 가드 |
| 응답 | JSON |

**쿼리 파라미터**

| 이름 | 필수 | 설명 |
| --- | :---: | --- |
| lat / lng | ● | 조회 좌표 |

**실패 시 동작**: 로드뷰 모달은 **정상 표시**하고 촬영일자 항목만 생략한다(UC-20 3E). 모달 전체를 실패시키지 않는다.

## 6. Supabase 데이터 접근 (`features/map-marker/api.ts`)

Route Handler가 아니라 **클라이언트 데이터 접근 계층**이다. 이 파일이 DB 경계다.

### 6.1 경계 규칙

| ID | 규칙 |
| --- | --- |
| DA-1 | **snake_case ↔ camelCase 변환은 이 파일에서만** 수행한다 |
| DA-2 | 컴포넌트는 Supabase 클라이언트를 직접 import하지 않는다 |
| DA-3 | 반환 타입은 `types/`에 정의된 도메인 타입이어야 한다(`any` 금지) |
| DA-4 | 사용 키는 **anon 키뿐**이다. service_role 키는 앱 어디에도 넣지 않는다 |

### 6.2 주요 함수 계약

| 함수 성격 | 입력 | 출력 | 부수효과 |
| --- | --- | --- | --- |
| 마커 일괄 조회 | — | `MapMarkersPayload` (장비 + 축전지 + 정보 + 스펙) | — |
| 마커 갱신 | 마커 부분 필드 | 갱신 행 | 쿼리 무효화 필요 |
| 마커 삭제 | id | — | `information`·`erp_details` CASCADE |
| 그룹 필드 갱신 | id, `parent_marker_id`/`group_role`/`group_key`/`detached_visible` | — | **비원자 다단계** → BR-G05 순서 준수 |
| 엑셀 커밋 | 파싱 결과 배열 | 성공/중복/실패 집계 | 대량 upsert |
| 백업 조회 | — | 5개 테이블 전량 | — |
| 복원 반영 | 시트별 행 | 결과 집계 | **덮어쓰기** |

### 6.3 오류 처리

| 상황 | 처리 |
| --- | --- |
| 컬럼 부재(마이그레이션 미적용) | 현재는 일반 DB 오류 메시지 → **[CR-001](./CHANGE_REQUEST/CR-001.md)에서 파일명 안내 추가** |
| RLS 거부 | 로그인 안내 토스트 |
| 네트워크 실패 | 재시도 안내, 지도는 기존 상태 유지 |
| 부분 저장 | 성공/실패 건수 표기 + 부분 저장 가능성 안내 |

## 7. 외부 의존 API

| 대상 | 용도 | 키 | 실패 시 |
| --- | --- | --- | --- |
| Kakao Maps JS SDK | 지도 렌더·클러스터·지오코딩·로드뷰 | JS 키(도메인 제한) | 지도 영역 오류 안내 |
| Kakao REST (정적맵) | 캡처 이미지 | **서버 전용 REST 키** | 타일 프록시 폴백 |
| Kakao 로드뷰 촬영일자 | 일자 표시 | 서버 경유 | 일자만 생략 |
| Supabase Auth | 이메일 로그인 | anon 키 | 인라인 오류 메시지 |
| Supabase PostgREST | 데이터 CRUD | anon 키 + RLS | 토스트 |
| VWorld | GPSMAP 좌표/주소 변환·지도 | GPSMAP 설정 참조 | 행 단위 실패 표기 |

> SDK 로드에는 `libraries=services,clusterer`가 필요하다. 누락 시 지오코딩·클러스터가 동작하지 않는다.

## 8. 신규 프록시 라우트 추가 절차

1. 라우트 파일 생성 (`src/app/api/<name>/route.ts`)
2. **origin 가드 적용** — 기존 라우트와 동일한 가드 재사용
3. 외부 호스트를 부르면 **allowlist 등록** + `proxy-guard` 테스트 추가
4. 서버 전용 키는 `NEXT_PUBLIC_` 접두사 없이 사용
5. 업스트림 오류를 그대로 흘리지 않도록 메시지 가공
6. 본 문서에 계약 추가 + [TEST_CASE](./TEST_CASE.md)에 TC 추가
