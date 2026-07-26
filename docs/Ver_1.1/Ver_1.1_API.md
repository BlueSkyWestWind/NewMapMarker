# Ver_1.1 API 문서 (API Contract)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 문서 버전: **Ver_1.1**
- 최종 갱신: 2026-07-26
- 관련 문서: [ARCHITECTURE](./Ver_1.1_ARCHITECTURE.md) · [DATABASE](./Ver_1.1_DATABASE.md) · [BUSINESS_RULE](./Ver_1.1_BUSINESS_RULE.md)

> MapMarker Pro는 공개 API를 제공하지 않는다. 아래 라우트는 **자기 앱 전용 서버 프록시**이며 origin 가드로 보호된다.

---

## 1. 인터페이스 개요

| 구분 | 대상 | 방식 |
| --- | --- | --- |
| 내부 Route Handler | **4종** (`/api/*`) | 브라우저 → 자기 서버 → 외부 |
| 데이터 접근 | Supabase | 브라우저 → Supabase (anon 키 + RLS) |
| 지도 SDK | Kakao Maps JS | 브라우저 직접 |
| 좌표 변환 | VWorld (GPSMAP) | 브라우저 직접 |
| **기상 데이터** | **기상청 API 허브** | **브라우저 → 자기 서버 → 기상청** |

## 2. 공통 규약

### 2.1 Origin 가드 (전 라우트 공통)

```
허용 origin = 자기 도메인 + NEXT_PUBLIC_SITE_URL + PROXY_ALLOWED_ORIGINS
```

| 상황 | 응답 |
| --- | --- |
| 허용 origin | 정상 처리 |
| 그 외 origin | **403 Forbidden** |
| IP당 60초 300건 초과 | **429** (`Retry-After: 60`) |

### 2.2 공통 오류 형식

```json
{ "error": "사람이 읽을 수 있는 한국어 메시지" }
```

| 상태 | 의미 |
| --- | --- |
| 400 | 필수 파라미터 누락 / 형식 오류 / 범위 초과 |
| 403 | origin 불허 · 호스트 allowlist 위반 |
| 404 | 대상 리소스 없음 |
| 429 | 레이트리밋 |
| 502 | 업스트림(카카오·기상청) 응답 실패 |
| 504 | 업스트림 타임아웃 |

### 2.3 보안 불변식

- 업스트림 **원문 오류 메시지를 그대로 반환하지 않는다** (인증키 유출 방지)
- 인증키는 서버 환경변수에서만 읽는다. `NEXT_PUBLIC_` 접두어 금지
- 모든 외부 호출에 `AbortSignal.timeout()` 적용

## 3. `/api/kakao-static-map`

Ver_1.0과 동일. [Ver_1.0 API §3](../Ver_1.0/API.md) 참조.

## 4. `/api/map-tile-proxy`

Ver_1.0과 동일.

## 5. `/api/roadview-dates`

Ver_1.0과 동일.

## 6. `/api/worksite-weather` **(Ver_1.1 신규)**

### 6.1 요청

```
GET /api/worksite-weather?lat=34.9506&lng=127.4872&workType=elevated&region=전라남도 순천시
```

| 파라미터 | 필수 | 형식 | 설명 |
| --- | --- | --- | --- |
| `lat` | ✓ | number | 위도 |
| `lng` | ✓ | number | 경도 |
| `workType` | | `ground` \| `elevated` | 기본 `ground`. `elevated`는 강풍 판정 강화 |
| `region` | | string | 특보 지역 매칭용 주소(앞 20자) |

> **`q`(국소명) 파라미터는 없다.** 좌표 해석은 클라이언트 책임이다 —
> 마커가 이미 스토어에 있고 지오코딩은 브라우저 SDK 전용이라 서버에서 할 수 없다.

### 6.2 처리 순서

1. `guardProxyRequest`
2. `lat`/`lng` **원시 문자열 존재 확인** → 숫자 변환 → 격자 변환 → 국내 범위 검사
3. 기준시각 계산 (KST 보정)
4. 캐시 조회 → MISS 시 외부 4건 `Promise.all`
5. 병합 → 11슬롯 판정 → 종합 판정 → 권장 시간대
6. 응답 (`Cache-Control: private, max-age=600`)

> `Number(null)`과 `Number("")`은 **0**이다. 원시 문자열을 먼저 확인하지 않으면
> 파라미터 미지정 요청이 좌표 (0,0)으로 통과한다.

### 6.3 응답 (200)

```json
{
  "site": { "lat": 34.9506, "lng": 127.4872,
            "grid": { "nx": 70, "ny": 70 }, "workType": "elevated" },
  "date": "2026-07-26",
  "issuedAt": "2026-07-26T05:00:00+09:00",
  "overall": "danger",
  "recommendedWindows": [{ "from": "07:00", "to": "11:00", "note": "" }],
  "timeline": [
    { "time": "1500", "source": "ultra",
      "temp": 35, "apparent": 35.9, "humidity": 65,
      "windSpeed": 4, "windDeg": 225, "windDir": "남서", "windLabel": "약간 강함",
      "pop": 0, "pty": "없음", "pcp": 0, "pcpLabel": "없음",
      "sno": 0, "snoLabel": "없음", "sky": "구름많음",
      "verdict": "danger", "reasons": ["체감온도 35.9℃"] }
  ],
  "hazardSummary": {
    "heat": { "level": "danger", "peak": 35.9, "peakTime": "15:00", "note": "…" },
    "cold": { "level": "none", "peak": null, "peakTime": null, "note": "해당 없음" },
    "wind": { "level": "none", "peak": null, "peakTime": null, "note": "해당 없음" },
    "rain": { "level": "none", "peak": null, "peakTime": null, "note": "해당 없음" }
  },
  "alerts": [
    { "type": "폭염", "level": "경보", "region": "순천시", "issuedAt": "202607231400" }
  ],
  "typhoon": null,
  "warnings": [],
  "disclaimer": "기상청 예보 기반 참고값입니다. …"
}
```

| 필드 | 비고 |
| --- | --- |
| `timeline` | **항상 11개** (0700~1700). 결측 슬롯도 자리를 지킨다 |
| `verdict` | `safe`·`caution`·`warning`·`danger`·`stop`·`unknown` |
| `source` | `past`·`ncst`·`ultra`·`vilage`·`missing` |
| `recommendedWindows` | **배열** — 오전·오후로 갈릴 수 있다 |
| `typhoon` | `null`이면 프론트엔드가 렌더링하지 않는다 |
| `warnings` | 결측·특보 확인 불가 등 사용자 고지 |

### 6.4 오류

| 상태 | 메시지 | 조건 |
| --- | --- | --- |
| 400 | `lat, lng 파라미터가 필요합니다.` | 미지정 |
| 400 | `lat, lng 파라미터가 올바른 숫자가 아닙니다.` | 숫자 변환 실패 |
| 400 | `기상청 격자 범위를 벗어난 좌표입니다…` | 국내 격자 밖 |
| 403 | `허용되지 않은 요청 출처입니다.` | origin 불허 |
| 502 | `기상청 인증키가 설정되지 않았습니다…` | 환경변수 없음 |
| 502 | `기상청 인증키가 유효하지 않습니다…` | 401 / resultCode 30·31·32 |
| 502 | `기상청 인증키는 유효하지만 이 서비스에 활용신청이…` | **403** |
| 502 | `기상청 API 요청이 시간 초과되었거나…` | 타임아웃(8초) |

> 401(키 오류)과 403(활용신청 누락)은 **원인과 조치가 완전히 다르다.** 반드시 구분해 안내한다.

### 6.5 업스트림

| 데이터 | 엔드포인트 | 형식 |
| --- | --- | --- |
| 단기예보 | `typ02/openApi/VilageFcstInfoService_2.0/getVilageFcst` | JSON |
| 초단기실황 | `typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtNcst` | JSON |
| 초단기예보 | `typ02/openApi/VilageFcstInfoService_2.0/getUltraSrtFcst` | JSON |
| **기상특보** | `typ01/url/wrn_now_data.php` | **텍스트 / EUC-KR** |

> 허브는 공공데이터포털식 `WthrWrnInfoService`(JSON)를 **"허용되지 않은 API"로 거부**한다.
> 특보만 레거시 typ01 경로이며, `typ02` 루트에 이어 붙이면 안 된다(`legacyRoot` 별도).

### 6.6 인증키 설정

| 포털 | 환경변수 | 파라미터 | 비고 |
| --- | --- | --- | --- |
| 기상청 API 허브 | `KMA_API_HUB_KEY` | `authKey` | **권장** — 키 형태 1종 |
| 공공데이터포털 | `KMA_SERVICE_KEY` | `serviceKey` | **Decoding 키** 사용 |

- 둘 다 있으면 허브 우선.
- 퍼센트 인코딩이 섞인 키는 자동 디코드한다(Encoding 키 오입력 방어).
- 허브는 **오퍼레이션 단위로 활용신청**한다. 단기예보조회와 초단기 2종은 별개 항목이다.

## 7. Supabase 데이터 접근

### 7.1 `fetchMapMarkers` (Ver_1.1 변경)

```
fetchAllRows(fetchPage)  ×4 (Promise.all)
  markers         select('*', {count:'exact'}).order('created_at',desc).order('id').range()
  information     select('*', {count:'exact'}).order('id').range()
  battery_markers select('*', {count:'exact'}).order('created_at',desc).order('id').range()
  battery_specs   select('*', {count:'exact'}).order('id').range()
```

| 항목 | 값 |
| --- | --- |
| 페이지 크기 | 1,000 |
| 최대 페이지 | 50 (5만 행) |
| 종료 조건 | `rows.length >= count` 또는 빈 배치 |
| 커서 이동 | **실제 받은 개수만큼** — 서버 상한이 더 작아도 안전 |

> `select('*')`만 쓰면 PostgREST 상한 초과분이 **오류 없이 잘린다.**
> 마커가 지도에서 사라지는데 에러도 안 나므로 발견이 늦다.

## 8. 외부 의존 API

| 대상 | 인증 | 호출 주체 |
| --- | --- | --- |
| Kakao Maps JS SDK | JS 키 (도메인 제한) | 브라우저 |
| Kakao REST (Static Map) | `KAKAO_REST_API_KEY` | 서버 |
| VWorld | `NEXT_PUBLIC_VWORLD_API_KEY` (Referer 제한) | 브라우저 |
| Supabase | anon 키 + RLS | 브라우저 |
| **기상청 API 허브** | **`KMA_API_HUB_KEY`** | **서버** |
| weather.go.kr / windy.com | 없음 (iframe) | 브라우저 |

## 9. 신규 프록시 라우트 추가 절차

1. `src/app/api/{name}/route.ts` 생성
2. **첫 줄에 `guardProxyRequest(request)`**
3. 파라미터를 원시 문자열로 먼저 검증 (`Number(null) === 0` 주의)
4. `AbortSignal.timeout()` 적용
5. 오류는 `{ error: "한국어" }` 형식. 업스트림 원문 노출 금지
6. 외부 호출 로직은 `features/*/lib/`에 두고 `import "server-only"` 표시
7. 본 문서에 절 추가
