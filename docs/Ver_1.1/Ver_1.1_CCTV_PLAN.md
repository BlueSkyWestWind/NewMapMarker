# 광주·전남 도로 구간별 CCTV 매핑 시스템 구축 계획

| 항목 | 내용 |
|---|---|
| 문서명 | 광주·전남 도로 구간별 CCTV 매핑 시스템 구축 계획 |
| 작성일 | 2026-07-27 |
| 작성자 | 윤동기 |
| 버전 | v0.1 (초안) |
| 문서 버전 | **Ver_1.1** |
| 상태 | 📋 **0주차 — 선결 확인 진행 중** (§10) |
| 관련 문서 | [PLAN](./Ver_1.1_PLAN.md) · [ARCHITECTURE](./Ver_1.1_ARCHITECTURE.md) · [API](./Ver_1.1_API.md) |

---

## 1. 목적

광주광역시·전라남도 관내 도로를 표준 링크 단위로 구분하고, 각 구간을 촬영하는 공공 CCTV를 매핑하여 지도 상에서 조회할 수 있는 시스템을 구축한다.

**기대 효과**

- 도로 구간별 담당 CCTV를 즉시 조회 가능
- CCTV가 배정되지 않은 구간(관제 사각지대)을 시각적으로 식별
- 시군구 단위 커버리지 현황 집계 및 보고자료 산출

**본 시스템의 범위가 아닌 것**

- 실시간 영상 스트리밍 재생 (별도 검토 사항)
- 자체 설치 CCTV 관리
- 영상 저장·분석

---

## 2. 대상 범위

### 2.1 행정구역

총 27개 시군구를 대상으로 한다.

| 시도 | 개수 | 시군구 |
|---|---|---|
| 광주광역시 | 5 | 동구, 서구, 남구, 북구, 광산구 |
| 전라남도 | 22 | 목포시, 여수시, 순천시, 나주시, 광양시, 담양군, 곡성군, 구례군, 고흥군, 보성군, 화순군, 장흥군, 강진군, 해남군, 영암군, 무안군, 함평군, 영광군, 장성군, 완도군, 진도군, 신안군 |

### 2.2 수집 좌표 범위

CCTV Open API 호출 시 사용할 경계상자(WGS84).

```
MinX = 125.00    MaxX = 127.95
MinY = 33.85     MaxY = 35.50
```

전남이 신안군 서부 도서에서 광양시까지 동서로 넓게 분포하므로 여유 있게 설정하였다. 이 사각형에는 전라북도 남부와 경상남도 서부가 포함되므로, 수집 직후 행정경계 폴리곤으로 클리핑하여 대상 외 지역을 제거한다.

---

## 3. 데이터 소스

| 데이터 | 출처 | 제공 형태 | 갱신 주기 |
|---|---|---|---|
| CCTV 정보 | ITS 국가교통정보센터 오픈데이터 | Open API | 월 1회 재수집 |
| 표준노드링크 | ITS 국가교통정보센터 / 공공데이터포털 | 파일(SHP) | 분기 (수동) |
| 시군구 행정경계 | 공공데이터포털 | 파일(SHP) | 연 1회 (수동) |

**참고사항**

- 기존 `openapi.its.go.kr` 포털은 신규 서비스 신청이 종료되었으므로, ITS 오픈데이터 홈페이지에서 인증키를 신청해야 한다.
- 표준노드링크에는 시군구별 권역코드 및 행정경계 데이터가 함께 제공된다.

---

## 4. 시스템 구성

```
[ITS Open API] ──월배치──▶ [수집 모듈] ──▶ [PostgreSQL + PostGIS]
                                                    │
[표준노드링크 SHP] ──수동──▶ [적재 모듈] ──────────┤
                                                    │
[행정경계 SHP] ──────────▶ [적재 모듈] ──────────┘
                                                    │
                                                    ▼
                                            [조회 API 서버]
                                                    │
                                                    ▼
                                        [웹 화면 · 카카오맵]
```

**기술 스택**

| 구분 | 선정 |
|---|---|
| 공간 DB | PostgreSQL + PostGIS |
| 지도 | 카카오맵 JavaScript API |
| 좌표계 | 저장·표출 모두 WGS84(EPSG:4326)로 통일 |

---

## 5. 데이터 처리 절차

### 5.1 수집

1. 인증키로 CCTV Open API 호출 (경계상자 단위)
2. 응답을 스테이징 테이블에 적재
3. 행정경계 폴리곤으로 클리핑하여 대상 외 지역 제거

### 5.2 시군구 귀속

**1순위 — 권역코드 활용**

표준노드링크의 노드·링크 ID 체계는 시군구별 권역코드를 따른다. ID 앞자리만으로 시군구 판별이 가능한지 우선 확인한다. 권역과 시군구가 1:1이 아닌 경우가 있으므로 `권역코드 ↔ 행정구역코드` 매핑 테이블을 별도로 구축한다.

**2순위 — 공간조인**

권역코드 활용이 불가할 경우 행정경계 SHP를 적재하여 `ST_Within` 공간조인으로 귀속시킨다.

**링크의 경계 걸침 처리**

CCTV는 점이므로 시군구가 하나로 확정되나, 링크는 선이므로 시군구 경계를 걸치는 경우가 발생한다.

| 방식 | 기준 | 적용 |
|---|---|---|
| 대표 귀속 | 링크 중점(`ST_LineInterpolatePoint(geom, 0.5)`)이 속한 시군구 | 기본값. 보고·집계용 |
| 중복 귀속 | 걸치는 모든 시군구에 매핑 | 조회 화면의 "경계 걸침 포함" 옵션 |

### 5.3 CCTV-링크 매칭

**전제 확인** — CCTV API 응답의 `roadsectionid` 필드에 값이 채워져 있으면 공간 매칭 없이 직접 사용한다. 값이 없거나 갱신되지 않은 경우 아래 공간 매칭을 수행한다.

**방향 판별**

표준링크는 도로중심선을 방향별로 이격시켜 생성하므로 상행·하행이 별개 링크이다. 단순 최근접 매칭 시 하행 CCTV가 상행 링크에 잘못 매핑되므로 방향 일치 조건이 필수이다.

- CCTV 명칭에서 방향 표기("상행/하행", "○○방향")를 파싱
- 링크의 시점→종점 방위각과 대조하여 검증

**매칭 쿼리**

```sql
SELECT c.cctv_id, l.link_id,
       ST_Distance(c.geom::geography, l.geom::geography) AS dist_m
FROM   cctv c
JOIN   link l
  ON   ST_DWithin(c.geom::geography, l.geom::geography, 400)
WHERE  c.direction = l.direction
ORDER  BY c.cctv_id, dist_m;
```

**매칭 파라미터**

| 항목 | 초기값 | 비고 |
|---|---|---|
| 탐색 반경 | 400m | 고속도로는 확대, 시가지 국도는 축소하여 조정 |
| 관계 | 1:N (양방향) | CCTV 1대가 다수 링크 커버, 링크 1개를 다수 CCTV가 촬영 |
| 대표 지정 | `is_primary` 플래그 | 최근접 CCTV를 대표로 지정 |

---

## 6. 화면 설계

### 6.1 지역 선택

- **1단계** — 시도 구분: 전체 / 광주 / 전남
- **2단계** — 시군구 다중선택 (칩 형태)
- 27개 항목을 단일 드롭다운에 배치하지 않는다
- 미선택 시 광주+전남 전체를 기본 표출

### 6.2 지도 표출

| 요소 | 처리 |
|---|---|
| 화면 이동 | 선택 시군구의 합집합 bbox로 `map.setBounds()` 호출 |
| bbox 사전계산 | 시군구별 `ST_Envelope` 결과를 테이블에 미리 저장 (실시간 계산 시 지연 발생) |
| 선택 범위 표시 | 시군구 경계를 `Polygon`으로 투명도 0.1 오버레이 |
| 링크 표출 | 담당 CCTV 보유 = 색상 / 미보유 = 회색 |
| 뷰포트 제한 | `idle` 이벤트에서 `getBounds()` 기준 조회, 낮은 줌 레벨은 고속도로·주요국도만 표출 |
| 클릭 처리 | 표시선 하단에 `strokeOpacity: 0`, `strokeWeight: 12` 히트라인을 겹쳐 배치 |

### 6.3 요약 정보

선택 상태에 따라 실시간 갱신한다.

- 선택 지역 수
- CCTV 대수
- 담당 링크 수
- 미배정 링크 수 (커버리지 공백)

---

## 7. 데이터 모델

### `sgg` — 시군구

| 컬럼 | 타입 | 설명 |
|---|---|---|
| sgg_cd | varchar(10) PK | 행정구역코드 |
| sido_cd | varchar(2) | 시도코드 |
| sgg_nm | varchar(50) | 시군구명 |
| geom | geometry(MultiPolygon, 4326) | 경계 |
| bbox | geometry(Polygon, 4326) | 사전계산 경계상자 |

### `cctv` — CCTV

| 컬럼 | 타입 | 설명 |
|---|---|---|
| cctv_id | varchar(30) PK | CCTV 식별자 |
| cctv_nm | varchar(200) | 명칭 |
| geom | geometry(Point, 4326) | 위치 |
| direction | varchar(10) | 촬영방향 (명칭 파싱 결과) |
| road_type | varchar(10) | 고속도로 / 국도 |
| stream_url | text | 영상 URL |
| sgg_cd | varchar(10) FK | 소속 시군구 |
| status | varchar(10) | 운영 / 철거 |
| collected_at | timestamp | 최종 수집일시 |

### `link` — 표준링크

| 컬럼 | 타입 | 설명 |
|---|---|---|
| link_id | varchar(20) PK | 링크ID |
| f_node / t_node | varchar(20) | 시점 / 종점 노드 |
| road_rank | varchar(3) | 도로등급 |
| road_no | varchar(10) | 노선번호 |
| road_nm | varchar(100) | 도로명 |
| bearing | numeric(5,1) | 시점→종점 방위각 |
| length_m | numeric(10,1) | 연장 |
| geom | geometry(LineString, 4326) | 선형 |
| sgg_cd | varchar(10) | 대표 귀속 시군구 |

### `cctv_link_map` — 매핑

| 컬럼 | 타입 | 설명 |
|---|---|---|
| cctv_id | varchar(30) | CCTV |
| link_id | varchar(20) | 링크 |
| dist_m | numeric(8,1) | 이격거리 |
| is_primary | boolean | 대표 CCTV 여부 |
| matched_at | timestamp | 매칭일시 |

*PK: (cctv_id, link_id)*

### `cctv_history` — 변경이력

| 컬럼 | 타입 | 설명 |
|---|---|---|
| seq | bigserial PK | 일련번호 |
| cctv_id | varchar(30) | CCTV |
| change_type | varchar(10) | NEW / DEL / MOVE |
| before_geom | geometry(Point, 4326) | 변경 전 위치 |
| after_geom | geometry(Point, 4326) | 변경 후 위치 |
| changed_at | timestamp | 변경 확인일시 |

---

## 8. 운영 계획

### 8.1 CCTV 월 배치 (자동)

전량 덮어쓰기가 아닌 차분(diff) 방식으로 처리한다.

1. 스테이징 테이블에 CCTV 목록 전량 수집
2. 운영 테이블과 비교 → 신규 / 철거 / 좌표변경 3종 분류
3. 변경분에 한해 재매칭 수행
4. `cctv_history`에 변경 이력 적재

철거·이설된 CCTV는 API 응답에서 그대로 사라지므로, 이력을 직접 남기지 않으면 추적이 불가능하다. 4단계는 향후 "특정 구간의 CCTV가 언제 제거되었는가"에 대한 유일한 근거자료가 된다.

### 8.2 표준노드링크 갱신 (수동)

- 자동화하지 않는다
- 갱신 시 링크ID 자체가 변경되는 구간이 발생하므로, 갱신 후에는 매핑 전체를 재계산한다
- 자동 배치에 포함할 경우 매핑이 조용히 손상될 위험이 있다

---

## 9. 추진 일정

| 주차 | 작업 | 산출물 |
|---|---|---|
| 0주 | 인증키 신청, 사전조사 스크립트 실행 (10장 참조) | 조사 결과, `cctv_raw.csv` |
| 1주 | 원천 데이터 확보, 조사 결과에 따른 후속 공정 확정 | 확인 결과서 |
| 2~3주 | PostGIS 구축, 링크·행정경계 적재, 좌표계 변환 | DB 스키마 |
| 4주 | 시군구 귀속, CCTV-링크 매칭 로직 개발 | 매칭 결과 |
| 5~6주 | 조회 API 및 웹 화면 개발 | 화면 |
| 7주 | 표본 구간 육안 검증, 반경·방향 파라미터 조정 | 검증 보고 |
| 8주 | 월 배치 구성, 운영 이관 | 운영 매뉴얼 |

---

## 10. 선결 확인사항

착수 전 아래 3건을 확인해야 후속 작업량이 확정된다.

| No | 확인 항목 | 확인 방법 | 영향 |
|---|---|---|---|
| 1 | CCTV API의 `roadsectionid` 채움 여부 | 사전조사 스크립트 | 채워져 있으면 공간매칭 공정 생략 |
| 2 | CCTV 명칭의 방향 표기 형식 | 사전조사 스크립트 | 파싱 규칙 확정 |
| 3 | 표준노드링크 배포본 좌표계 | `.prj` 파일 확인 | `ST_Transform` 필요 여부 |

### 10.1 사전조사 스크립트

1·2번은 별첨 `cctv_survey.py`로 확인한다. 광주·전남 경계상자로 CCTV 목록을 수집하여 CSV로 저장하고, `roadsectionid` 채움률과 명칭의 방향 표기 형태를 집계한다.

```
pip install requests
export ITS_API_KEY="발급키"
python cctv_survey.py
```

**주의** — 스크립트 상단의 `ENDPOINT`와 요청 파라미터명은 인증키 발급 시 수령한 API 매뉴얼과 대조하여 확정해야 한다. ITS 오픈데이터 개편으로 변경되었을 수 있다.

### 10.2 판정 기준

조사 결과에 따라 후속 공정 범위가 결정된다.

| 조사 결과 | 판정 | 일정 영향 |
|---|---|---|
| `roadsectionid` 채움률 95% 이상 | 공간매칭 생략, 직접 사용 | 4주차 단축 |
| 채움률 50~95% | 부분 활용, 빈 건만 공간매칭 | 변동 없음 |
| 채움률 50% 미만 또는 필드 없음 | 공간매칭 전면 적용 | 변동 없음 |
| 방향정보 없는 명칭 30% 미만 | 파싱 자동화로 충분 | 변동 없음 |
| 방향정보 없는 명칭 30% 이상 | 수동 보정 화면 개발 추가 | 5~6주차 확대 |

---

## 11. 위험요소 및 대응

| 위험 | 영향도 | 대응 |
|---|---|---|
| `roadsectionid` 미제공 또는 미갱신 | 중 | 공간매칭 로직으로 대체 (본 계획에 포함) |
| CCTV 명칭에 방향 정보 부재 | 중 | 수동 보정 화면 제공, 육안 확인으로 방향 지정 |
| 표준노드링크 갱신 시 링크ID 변경 | 상 | 수동 트리거 + 매핑 전체 재계산 원칙 유지 |
| 좌표계 변환 누락 | 상 | 적재 단계에서 EPSG 검증 로직 필수 |
| 도서·산간 지역 CCTV 부재 | 하 | 오류가 아닌 커버리지 공백으로 정상 표기 |
| API 스펙 변경 또는 장애 | 중 | 최종 성공 수집본 유지, 배치 실패 시 알림 발송 |

---

## 부록 A — 사전조사 스크립트

10.1항의 사전조사 스크립트 전문이다. `cctv_survey.py`로 저장하여 사용한다. 실행 시 `cctv_raw.csv`가 생성되며, 이 파일의 컬럼 목록이 7장 데이터 모델 확정의 기준이 된다.

```python
"""
광주·전남 CCTV 목록 수집 및 명칭 형식 조사

사용법:
    pip install requests
    export ITS_API_KEY="발급받은키"
    python cctv_survey.py

산출물:
    cctv_raw.csv      수집 원본
    조사 결과는 콘솔에 출력
"""

import os
import re
import csv
import sys
import json
from collections import Counter

import requests

# ---------------------------------------------------------------
# 발급받은 인증키의 API 문서와 대조해서 확인 필요.
# ITS 오픈데이터 개편 이후 엔드포인트/파라미터명이 바뀌었을 수 있음.
# 응답이 비거나 오류가 나면 여기부터 점검할 것.
# ---------------------------------------------------------------
ENDPOINT = "https://openapi.its.go.kr:9443/cctvInfo"

API_KEY = os.environ.get("ITS_API_KEY", "")

# 광주·전남 경계상자 (WGS84)
BBOX = {"minX": 125.00, "maxX": 127.95, "minY": 33.85, "maxY": 35.50}

# ex = 고속도로, its = 국도
ROAD_TYPES = ["ex", "its"]

CSV_PATH = "cctv_raw.csv"


def fetch(road_type):
    params = {
        "apiKey": API_KEY,
        "type": road_type,
        "cctvType": "1",
        "getType": "json",
        **BBOX,
    }
    r = requests.get(ENDPOINT, params=params, timeout=30)
    r.raise_for_status()

    try:
        body = r.json()
    except json.JSONDecodeError:
        print(f"[{road_type}] JSON 파싱 실패. 응답 앞부분:")
        print(r.text[:500])
        return []

    # 응답 구조가 배포본마다 조금씩 다름. 흔한 두 형태를 모두 시도.
    data = body.get("response", body)
    rows = data.get("data") or data.get("body") or []
    if isinstance(rows, dict):
        rows = rows.get("items") or rows.get("item") or []

    for row in rows:
        row["_roadType"] = road_type
    return rows


def analyze(rows):
    total = len(rows)
    print("=" * 60)
    print(f"총 수집 대수: {total:,}대")
    print("=" * 60)

    if total == 0:
        print("\n수집 결과가 없습니다. ENDPOINT와 파라미터명을 먼저 점검하세요.")
        return

    # --- 선결 확인 1: roadsectionid 채움률 -----------------------
    print("\n[1] roadsectionid 채움률")
    key = next(
        (k for k in rows[0] if k.lower().replace("_", "") == "roadsectionid"),
        None,
    )
    if key is None:
        print("  응답에 roadsectionid 필드 자체가 없음 → 공간매칭 필수")
        print(f"  실제 필드 목록: {', '.join(rows[0].keys())}")
    else:
        filled = sum(1 for r in rows if str(r.get(key, "")).strip())
        pct = filled / total * 100
        print(f"  필드명: {key}")
        print(f"  채움: {filled:,} / {total:,} ({pct:.1f}%)")
        if pct >= 95:
            print("  → 공간매칭 공정 생략 가능. 4주차 일정 단축")
        elif pct >= 50:
            print("  → 부분 활용. 빈 건만 공간매칭으로 보완")
        else:
            print("  → 신뢰 불가. 공간매칭 전면 적용")

    # --- 선결 확인 2: 명칭의 방향 표기 형식 ----------------------
    print("\n[2] 명칭 방향 표기 분석")
    name_key = next(
        (k for k in rows[0] if "name" in k.lower() or "nm" in k.lower()),
        None,
    )
    if name_key is None:
        print("  명칭 필드를 찾지 못함")
        return

    names = [str(r.get(name_key, "")) for r in rows]

    updown = sum(1 for n in names if "상행" in n or "하행" in n)
    toward = [m.group(1) for n in names for m in re.finditer(r"(\S{1,6})방향", n)]
    arrow = sum(1 for n in names if "↑" in n or "↓" in n or "→" in n or "←" in n)
    none_of = total - sum(
        1 for n in names
        if any(t in n for t in ("상행", "하행", "방향", "↑", "↓", "→", "←"))
    )

    print(f"  상행/하행 표기 : {updown:,}건 ({updown / total * 100:.1f}%)")
    print(f"  ○○방향 표기   : {len(toward):,}건")
    print(f"  화살표 표기    : {arrow:,}건")
    print(f"  방향정보 없음  : {none_of:,}건 ({none_of / total * 100:.1f}%)")

    if toward:
        print("\n  ○○방향 상위 15개:")
        for word, cnt in Counter(toward).most_common(15):
            print(f"    {word}방향  {cnt:,}건")

    print(f"\n  명칭 샘플 30건 (필드: {name_key}):")
    for n in names[:30]:
        print(f"    {n}")

    if none_of / total > 0.3:
        print("\n  ⚠ 방향정보 없는 건이 30%를 넘습니다.")
        print("    수동 보정 화면을 계획에 반드시 포함하세요.")

    # --- 도로 종별 분포 -----------------------------------------
    print("\n[3] 도로 종별 분포")
    for t, c in Counter(r["_roadType"] for r in rows).items():
        label = "고속도로" if t == "ex" else "국도"
        print(f"  {label}: {c:,}대")


def main():
    if not API_KEY:
        print("환경변수 ITS_API_KEY가 설정되지 않았습니다.")
        sys.exit(1)

    rows = []
    for t in ROAD_TYPES:
        try:
            got = fetch(t)
            print(f"[{t}] {len(got):,}건 수집")
            rows.extend(got)
        except requests.RequestException as e:
            print(f"[{t}] 호출 실패: {e}")

    if rows:
        cols = sorted({k for r in rows for k in r})
        with open(CSV_PATH, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            w.writerows(rows)
        print(f"\n원본 저장: {CSV_PATH}")

    analyze(rows)

    print("\n" + "=" * 60)
    print("주의: 경계상자는 사각형이라 전북 남부·경남 서부가 섞여 있습니다.")
    print("행정경계 SHP 적재 후 클리핑해야 실제 광주·전남 대수가 나옵니다.")
    print("=" * 60)


if __name__ == "__main__":
    main()
```

---

## 부록 B — 참고 링크

- ITS 국가교통정보센터 오픈데이터: https://www.its.go.kr/opendata/
- 표준노드링크: https://www.its.go.kr/nodelink/
- 공공데이터포털 표준노드링크: https://www.data.go.kr/data/15025526/fileData.do

---

## 부록 C — 프로젝트 정합성 검토 및 1단계 구현 범위

> 본 절은 계획서를 `0004_NewMapMarker`(MapMarker Pro) 실제 구성과 대조한 결과다.
> 계획서 본문은 원문 그대로 두고, 차이와 현재 구현 가능한 범위만 여기에 기록한다.

### C.1 실측으로 확인한 것 (2026-07-27)

| 확인 항목 | 결과 |
| --- | --- |
| ITS CCTV Open API 생존 | ✅ **정상** — `openapi.its.go.kr:9443/cctvInfo`가 응답한다 |
| **성공** 응답 봉투 | **`{ response: { coordtype, data: [...], datacount } }`** |
| **실패** 응답 봉투 | `{ header: { resultCode, resultMsg }, body: "" }` |
| 인증키 없이 호출 | `HTTP 401` + `resultCode 4005` |
| 행 필드 | `roadsectionid, coordx, coordy, cctvresolution, filecreatetime, cctvtype, cctvformat, cctvname, cctvurl` |

> 계획서 §10.1은 "ITS 오픈데이터 개편으로 엔드포인트가 바뀌었을 수 있다"고 우려했으나
> **엔드포인트는 그대로 살아 있다.**
>
> ⚠️ **성공과 실패의 응답 모양이 다르다.** 오류 응답만 보고 `body`를 파싱하도록 만들면
> 성공 응답에서 조용히 0건이 된다(실제로 그렇게 만들었다가 잡았다).
> **부록 A 스크립트의 파싱(`body.get("response", body)` → `data.get("data")`)은 올바르다.**

### C.2 계획서 전제 ↔ 실제 프로젝트 차이

| # | 계획서 전제 | 이 프로젝트 | 영향 |
| --- | --- | --- | --- |
| **X1** | PostgreSQL + **PostGIS** 독립 구축 | **Supabase** Postgres. PostGIS 활성화 여부 미확인 | 공간 연산 전면 |
| **X2** | 조회 API 서버 별도 | **Cloudflare Workers**(OpenNext). CPU·서브리퀘스트 제약 | 대량 공간 쿼리 부적합 |
| **X3** | SHP 파일 적재 | Workers에서 SHP 로딩 불가 (`ogr2ogr`·`shp2pgsql` 등 로컬 도구 필요) | 수동 선행 공정 |
| **X4** | 월 배치 자동 수집 | 스케줄러 미구성 (Cron Triggers·GitHub Actions 중 미정) | §8.1 미착수 |
| **X5** | 신규 웹 화면 | 기존 앱의 **장비 탭**에 통합 요청 | 4모드 체계에 편입 |
| **X6** | 링크 폴리라인 대량 표출 | 카카오맵 + 마커 685개가 이미 렌더 중 | 뷰포트 제한 필수(§6.2와 동일 판단) |

### C.3 현재 막혀 있는 것 — 착수 불가 사유

| Blocker | 상태 | 없으면 불가능한 공정 |
| --- | --- | --- |
| **ITS 인증키** | ❌ 미발급 | CCTV 수집 전체 (§5.1) |
| **표준노드링크 SHP** | ❌ 미확보 | 링크 적재·매칭·미배정 집계 (§5.2·5.3·6.3) |
| **행정경계 SHP** | ❌ 미확보 | 클리핑·시군구 귀속·bbox 사전계산 (§5.1·6.2) |
| **PostGIS** | ❓ 미확인 | 위 전부 |

> 계획서 §10이 **"착수 전 3건을 확인해야 후속 작업량이 확정된다"** 고 명시한 그대로,
> 현재는 **0주차(사전조사) 단계**다. 링크 매핑을 지금 구현하면 검증할 데이터가 없다.

### C.4 1단계 구현 범위 (본 세션에서 구현)

인증키만 있으면 즉시 동작하는 부분까지 구현한다. **데이터가 없는 공정은 만들지 않는다.**

| 구현 | 내용 | 계획서 대응 |
| --- | --- | --- |
| `GET /api/cctv` | ITS CCTV 프록시. bbox·도로종별. origin 가드·타임아웃·캐시 | §5.1 수집 |
| 방향 파싱 | 명칭에서 상행/하행·○○방향·화살표 추출 | §5.3 방향 판별 |
| **사전조사 집계** | `roadsectionid` 채움률 + 방향 표기 분포를 **앱 안에서** 산출 | **§10.1 대체** |
| 장비탭 패널 | 조회 범위·도로종별 선택, 요약, CCTV 목록 | §6.1·6.3 일부 |

> **§10.1의 `cctv_survey.py`를 앱 라우트로 대체한다.** Python 설치·별도 실행 없이
> 인증키만 넣으면 화면에서 바로 §10의 1·2번 질문에 답이 나온다.
> 부록 A 스크립트의 응답 파싱 오류(C.1)도 실구조 기준으로 바로잡았다.

### C.5 구현하지 않은 것 (데이터 부재)

| 항목 | 사유 |
| --- | --- |
| 시군구 2단계 선택 | 행정경계·bbox 데이터 없음. **좌표를 임의로 만들지 않는다** |
| 링크 표출·CCTV 매칭 | 표준노드링크 없음 |
| 미배정 링크 집계 | 위와 동일 |
| 월 배치·변경이력 | 스케줄러·테이블 미구성 |
| 영상 스트리밍 | 계획서 §1에서 명시적 범위 외 |

조회 범위는 계획서 **§2.2의 경계상자 값을 그대로** 기본값으로 쓴다.

### C.6 다음 단계 순서

| 순위 | 항목 | 선행 조건 |
| --- | --- | --- |
| 1 | ITS 인증키 발급 → 사전조사 실행 | — |
| 2 | 조사 결과로 §10.2 판정 → 후속 공정 확정 | 1 |
| 3 | Supabase PostGIS 활성화 확인 | — |
| 4 | 행정경계 SHP 적재 → 시군구 귀속·bbox | 3 |
| 5 | 표준노드링크 적재 → 링크 표출 | 3·4 |
| 6 | CCTV-링크 매칭 | 5, 그리고 2의 판정 |
| 7 | 월 배치(Cron Trigger 또는 GitHub Actions) | 6 |


---

## 부록 D — 사전조사 실행 결과 (2026-07-28)

`/api/cctv`로 계획서 §2.2 경계상자 전체를 조회한 실측값이다. §10.1 스크립트가 답해야 할 질문에 그대로 대응한다.

### D.1 수집 규모

| 항목 | 값 |
| --- | --- |
| 총 수집 | **1,006대** |
| 고속도로(`ex`) | 486대 |
| 국도(`its`) | 520대 |

> 경계상자가 사각형이라 전북 남부·경남 서부가 포함된 수치다. 행정경계 클리핑 전 값이다.

### D.2 선결 확인 ① — `roadsectionid`

| 항목 | 값 |
| --- | --- |
| 필드 존재 | ✅ **있음** |
| 채움 | **0 / 1,006 (0%)** |
| §10.2 판정 | 🔴 **공간매칭 전면 적용** |

> **필드는 있으나 값이 전부 비어 있다.** "필드 없음"과 "값 없음"은 다르지만 결론은 같다.
> 계획서 §5.3의 "값이 채워져 있으면 공간 매칭 없이 직접 사용" 경로는 **쓸 수 없다.**
> 표준노드링크 적재와 공간 매칭이 **필수 공정**으로 확정됐다.

### D.3 선결 확인 ② — 명칭 방향 표기

| 표기 | 건수 |
| --- | --- |
| 상행/하행 | 0 |
| ○○방향 | 0 |
| 화살표 | 0 |
| **방향정보 없음** | **1,006 (100%)** |

명칭 샘플: `[남해선] 죽평` · `[남해선] 지본교` · `[남해선] 구상` · `[남해선] 청룡교`

> 형식은 **`[노선명] 지점명`** 이며 방향 정보가 **전혀 없다.**
> §10.2 기준(30% 이상)을 크게 넘으므로 🔴 **수동 보정 화면 개발이 확정**된다 (5~6주차 확대).
>
> 계획서 §5.3의 "CCTV 명칭에서 방향 표기를 파싱" 전략은 **이 데이터에서는 성립하지 않는다.**
> 구현해 둔 파싱 함수는 동작하지만 잡을 것이 없다.

### D.4 판정 종합 — 두 항목 모두 최악 분기

| 확인 | 결과 | 일정 영향 |
| --- | --- | --- |
| ① roadsectionid | 채움률 0% | 변동 없음 (공간매칭 전면) |
| ② 방향 표기 | 없음 100% | **5~6주차 확대** (수동 보정 화면) |

### D.5 방향 판별 대안 (검토 필요)

명칭 파싱이 불가하므로 §5.3의 전제를 다시 세워야 한다.

| 대안 | 내용 | 비고 |
| --- | --- | --- |
| 수동 보정 | 영상(`cctvurl`) 확인 후 방향 지정 | 계획서가 예상한 경로. 1,006건 작업량 |
| 좌표 오프셋 추정 | 링크 방위각 기준 CCTV가 좌/우 어느 쪽에 치우쳤는지 | 이격이 작으면 오판. 검증 필요 |
| 방향 무시 | 링크 쌍(상·하행)에 동일 CCTV를 모두 매핑 | 정밀도 포기. 커버리지 집계에는 충분할 수 있음 |
| 노선명 활용 | 명칭의 `[남해선]`으로 노선 후보를 좁힘 | 방향은 못 얻지만 **매칭 정확도는 크게 오른다** |

> 마지막 항목이 실질적이다. 명칭에 **노선명이 일관되게 들어 있어** 링크의 `road_nm`과 대조하면
> 400m 반경 안의 엉뚱한 노선 링크를 걸러낼 수 있다. 방향 판별과 별개로 도입 가치가 있다.

---

## 부록 E. 배포 환경 전송 계층 — Cloudflare Workers 포트 제약 (2026-07-28)

계획서에 없던 문제다. **로컬에서는 되는데 배포본에서만 실패**했다.

### E.1 증상

배포본에서 CCTV 조회 시 `ITS API가 JSON이 아닌 응답을 반환했습니다`.
인증키는 Cloudflare Secret에 정상 등록된 상태였다.

### E.2 원인

| 사실 | 근거 |
| --- | --- |
| ITS는 **9443 포트에서만** 서비스한다 | 443·8443은 연결 거부 (실측) |
| Cloudflare Workers는 배포 시 `fetch()`의 **비표준 포트를 무시**하고 443으로 붙는다 | Cloudflare 공식 문서 |
| `data.go.kr`의 CCTV 항목은 **LINK 유형** | 443으로 받아주는 미러가 없다 |

로컬 Node의 `fetch`는 포트를 지키므로 개발 중에는 드러나지 않는다.

### E.3 해결 — `cloudflare:sockets`

`connect()`는 **임의 포트에 TLS 연결이 된다.** Workers에서 포트 제약을 우회하는 유일한 공식 경로다.
대신 HTTP/1.1을 직접 만들어야 한다 → `src/features/cctv/lib/http-over-socket.ts`.

- 비표준 포트일 때만 소켓을 쓰고, 소켓이 없는 런타임(로컬 Node)은 `fetch`로 되돌린다.
- 폴백 판별은 **오류 메시지 문구가 아니라** `SocketUnavailableError` 타입으로 한다.
  Node와 Workers의 문구가 다르고, 문구가 바뀌면 폴백이 조용히 깨진다.
- 번들러가 `cloudflare:sockets`를 해석하지 않도록 `webpackIgnore`·`turbopackIgnore` 주석이 필요하다.

### E.4 함정 — `writer.close()`가 연결을 끊는다

요청을 다 썼다는 뜻으로 `await writer.close()`를 부르면 **연결 전체가 닫힌다.**
`allowHalfOpen: true`로도 마찬가지였다. 응답을 한 바이트도 못 받고 끝난다.

요청의 끝은 헤더 뒤 빈 줄이 알리고, 응답의 끝은 `Connection: close`에 따라 서버가 닫는 시점이다.
→ **writer는 `releaseLock()`만 하고 닫지 않는다.** 회귀 테스트로 고정했다.

### E.5 실측 (workerd, 실제 키)

| 대상 | 결과 |
| --- | --- |
| `example.com:443`, writer 닫음 | ❌ `Network connection lost.` |
| `example.com:443`, 안 닫음 | ✅ 200 |
| `openapi.its.go.kr:9443`, 안 닫음 | ✅ **200 · 787건 · 263 KB** |

> 교훈: 런타임이 다르면 **네트워크 계층부터 다르다.** 로컬 `next start` 통과는
> Workers 배포본의 근거가 되지 못한다. 이런 부분은 `wrangler dev --local`로 따로 확인해야 한다.

### E.6 2차 실패 — `Stream was cancelled.` (2026-07-28)

소켓 전송 배포 후 오류가 바뀌었다. `JSON이 아닌 응답` → **`소켓 연결 실패 (Stream was cancelled.)`**.
소켓 경로는 타고 있으나 응답을 읽는 도중 스트림이 취소된다는 뜻이다.

**도달성부터 배제했다.** 한국 밖 경유지에서 `openapi.its.go.kr:9443`을 호출해 **HTTP 401**(더미 키)을 받았다.
→ ITS는 해외 IP를 차단하지 않고 9443은 외부에서 열려 있다. **지오블록 가설 기각.**
원인은 소켓 사용 방식이다.

취소를 만들 수 있는 지점 셋을 모두 막았다. 하나라도 남으면 **성공 응답을 받아 놓고도 오류로 뒤집힌다.**

| # | 지점 | 조치 |
| --- | --- | --- |
| 1 | `allowHalfOpen` 기본값(false) — 쓰기 쪽이 끝나면 연결 전체가 정리되며 읽는 중인 스트림이 취소될 수 있다 | `allowHalfOpen: true` |
| 2 | reader 락을 쥔 채 `socket.close()` 호출 → 잠긴 스트림 취소 실패 | 다 읽으면 `reader.releaseLock()` (오류 시에도) |
| 3 | `finally`의 `await socket.close().catch()` — **동기로 던지면 `.catch()`가 붙지 않아** 오류가 성공 반환값을 덮어쓴다 | `try/catch`로 감싸 close 실패를 삼킨다 |

추가로 `socket.closed`의 거부 사유를 붙잡아 오류 메시지에 함께 싣는다.
스트림 오류는 `Stream was cancelled.`처럼 원인을 감추는 문구만 나와서, 이것이 없으면 다음 실패도 진단할 수 없다.

> ⚠️ **미검증**: 위 세 가지는 실제 엣지에서 재현해 고른 것이 아니라 가설로 좁힌 것이다.
> 로컬 workerd(병렬 2건, 실제 키)는 통과했으나 1차 실패도 로컬은 통과했었다.
> 배포 후 다시 실패하면 메시지에 실린 `closed` 사유로 판단한다.

### E.7 최종 — Cloudflare에서는 불가능. Supabase Edge Function으로 이전 (2026-07-28)

E.6의 수정을 배포한 뒤 오류에 실린 `closed` 사유가 원인을 확정해 주었다.

```
Stream was cancelled. / proxy request failed, cannot connect to the specified address
```

Cloudflare 공식 문서는 이 메시지를 **"허용되지 않은 주소로 연결을 시도한 경우"** 로 설명한다.
그런데 대상은 `61.43.91.73`(KRNIC) — Cloudflare IP도, 사설망도, localhost도 아니다.
문서상 차단 대상이 아닌데도 엣지 egress가 거부한다.

**결론: Cloudflare Workers 안에서 ITS(9443)에 도달할 방법이 없다.**

| 경로 | 결과 |
| --- | --- |
| `fetch()` | 배포 시 포트를 버리고 443으로 붙음 |
| `cloudflare:sockets` `connect()` | egress가 거부 (`cannot connect to the specified address`) |

로컬 workerd가 두 번 다 통과했던 이유는 **사용자 PC에서 직접 나가기 때문**이다.
배포본만 Cloudflare egress를 거친다. `wrangler dev --local`은 이 계층을 재현하지 못한다.

#### 배제한 가설

| 가설 | 검증 | 결과 |
| --- | --- | --- |
| ITS가 해외 IP 차단 | 한국 밖에서 9443 호출 | ❌ 401 정상 응답 — 차단 없음 |
| 대상이 Cloudflare IP(루프백) | DNS 조회 | ❌ `61.43.91.73`, KRNIC |
| 인증키 오류 | 32자리 16진수 확인 | ❌ 유효 (`.env.local`에 뒤 공백 1칸, 코드가 `trim()`) |

#### 채택 — Supabase Edge Function 프록시

Deno 런타임은 포트를 그대로 지킨다. 이미 쓰고 있는 Supabase에 함수를 두어
**인증키를 서버에 유지한 채** 우회한다. 새 벤더가 늘지 않는다.

```
브라우저 → Cloudflare Worker(/api/cctv) → Supabase Edge Function(443) → ITS(9443)
```

- 함수: `supabase/functions/its-cctv/index.ts`
- 인증키: Supabase 시크릿 `ITS_API_KEY` (브라우저에 노출되지 않음)
- 함수 주소는 `NEXT_PUBLIC_SUPABASE_URL`에서 유도 — 환경변수가 늘지 않는다
- 열린 프록시가 되지 않도록 `type`·`cctvType` 화이트리스트와 경계상자 검증을 함수에서 수행
- **로컬도 같은 경로를 쓴다.** 환경마다 경로가 다르면 "로컬은 되는데 배포는 안 되는"
  상황을 또 만든다 — 이 기능이 이미 두 번 그렇게 깨졌다

`http-over-socket.ts`·`cloudflare-sockets.d.ts`와 관련 테스트 23건은 제거했다. 쓰이지 않는다.

#### 배포 절차 (최초 1회)

```bash
npx supabase login
npx supabase link --project-ref bgdqjtmkdprqencgnrbx
npx supabase secrets set ITS_API_KEY=<발급받은 키>
npx supabase functions deploy its-cctv
```

#### 실측 (Deno 2.9.4, 실제 키)

| 시험 | 결과 |
| --- | --- |
| 정상 조회 (`ex`) | ✅ 200 · **787건** · 263 KB |
| 잘못된 `type` | ✅ 400 거부 |
| 경계상자 뒤집힘·누락 | ✅ 400 거부 |
| CORS 프리플라이트 | ✅ 204 + 헤더 |

> ⚠️ **미검증**: 함수 로직은 Deno로 실제 검증했으나, **Supabase에 배포한 상태에서의
> 종단 확인은 아직이다.** 배포 후 `/api/cctv` 호출로 확인해야 한다.

### E.8 Supabase(도쿄)도 차단 — 서버 경유 자체가 막힌다 (2026-07-28)

프록시 함수는 정상 배포됐다(`x-served-by: supabase-edge-runtime`).
그런데 ITS 호출이 20초 무응답으로 끊긴다. 실패 시 대조군을 함께 찔러 원인을 갈랐다.

| 대상 | 결과 |
| --- | --- |
| `example.com:443` | ✅ 200 · 63ms |
| `www.its.go.kr:443` | ❌ 8초 무응답 |
| `openapi.its.go.kr:443` | ❌ 8초 무응답 |

리전 아웃바운드는 멀쩡하다(63ms). **`its.go.kr` 도메인 전체에 닿지 못한다.**
9443 포트 문제가 아니라 **네트워크 차단**이다.

#### 차단 범위 — 해외 전체가 아니다

별도의 제3 데이터센터에서 `openapi.its.go.kr:9443`을 호출하면 **401이 정상 반환된다.**
즉 ITS는 해외를 통째로 막는 것이 아니라 **특정 네트워크만** 막는다.

| 경유지 | ITS 도달 |
| --- | --- |
| 사용자 PC (한국) | ✅ 787건 정상 |
| 제3 데이터센터 | ✅ 401 (도달함) |
| Cloudflare Workers egress | ❌ `cannot connect to the specified address` |
| Supabase Edge (AWS 도쿄, ap-northeast-1) | ❌ 무응답 |

#### 판단

브라우저는 ITS에 직접 닿고(사용자가 한국), ITS는 **CORS를 지원한다**
(`Access-Control-Allow-Origin`이 Origin을 반향, `GET` 허용 — E.7 이전에 실측).
서버를 경유하는 모든 경로가 막힌 상황에서 확실히 동작하는 것은 브라우저 직접 호출뿐이다.
대가는 **인증키가 번들에 노출**되는 것이다.

다른 호스트(예: 서울 리전 서버)는 될 수도 있으나 **검증 전에는 알 수 없다.**
Cloudflare와 Supabase가 연달아 막힌 이력을 감안해야 한다.

> 부수 문제: 호출부 타임아웃 25초 < 함수 최대 소요 28초(ITS 20 + 대조군 8)라
> 진단 결과가 UI에 닿기 전에 잘렸다. 함수를 직접 호출해 확보했다.

### E.9 채택 — 브라우저 직접 호출 (2026-07-28)

서버 경유가 전부 막힌 것을 확인하고(E.7·E.8) 브라우저에서 ITS를 직접 호출하도록 바꿨다.

#### 근거

| 조건 | 확인 |
| --- | --- |
| 사용자 브라우저(한국)가 ITS에 도달 | ✅ 9443 정상 |
| ITS가 CORS 지원 | ✅ `Access-Control-Allow-Origin`이 Origin 반향, `GET` 허용 |
| 프리플라이트 필요 여부 | 불필요 — 단순 GET에 `Accept`만 사용(safelisted) |

#### 구조 변경

```
(이전) 브라우저 → /api/cctv → Supabase Function → ITS   ✗ 막힘
(현재) 브라우저 → ITS                                    ✓
```

- `its-client.ts`에서 `server-only` 제거, ITS를 직접 호출
- 라우트가 하던 병합·중복 제거·집계·부분 실패 처리를 `cctv-api.ts`로 이동
- `src/app/api/cctv/route.ts` 삭제 · `supabase/functions/its-cctv` 삭제
- `normalizeCctvResponse`와 그 테스트 4건 삭제 — HTTP 캐시 경계를 막던 것인데
  경계 자체가 사라졌다

#### 트레이드오프 — 인증키 노출

`NEXT_PUBLIC_ITS_API_KEY`는 **빌드 시점에 번들로 박히며 공개된다.** 감출 방법이 없다.

- 저장소가 공개이므로 `wrangler.jsonc`의 `vars`에 넣지 않는다.
  Cloudflare **빌드 환경변수**로만 주입한다(`NEXT_PUBLIC_*`은 런타임 변수로 동작하지 않는다).
- ITS 키는 무료이고 재발급이 가능하다. 유출 시 재발급이 대응책이다.
- 서버 경유가 가능해지면(예: 한국 리전 호스팅) 되돌릴 수 있도록 파싱 로직은
  런타임 중립으로 유지했다.

#### 실측 (배포 도메인을 Origin으로 지정)

| 종별 | 결과 |
| --- | --- |
| `ex` 고속도로 | ✅ 200 · ACAO 반향 · 486건 |
| `its` 국도 | ✅ 200 · ACAO 반향 · 520건 |
| 합계 | **1,006건** (기존 실측치와 일치) |

#### 남은 정리

- Cloudflare의 `ITS_API_KEY` 시크릿은 더 이상 쓰이지 않는다 — 삭제 가능
- Supabase에 배포된 `its-cctv` 함수도 쓰이지 않는다 — 삭제 가능

### E.10 인증키 전달 — 빌드 변수 의존을 없앰 (2026-07-28)

E.9 배포 후에도 "ITS 인증키가 설정되지 않았습니다"가 떴다.
배포된 번들을 직접 받아 확인했다.

```js
apiKey", function(){ ... tB.env.NEXT_PUBLIC_ITS_AP...   ← 값이 아니라 참조
```

키 문자열은 번들에 **0회** 등장한다. 즉 **빌드 시점에 변수가 없었다.**
`NEXT_PUBLIC_*`은 빌드 때 리터럴로 치환되는 값이라, Cloudflare의 **런타임** 변수로
등록하면 참조만 남고 브라우저에서 `undefined`가 된다.

빌드 변수로 옮기면 해결되지만, 이 프로젝트는 빌드/런타임 변수 혼동으로
같은 실패를 반복했다(KMA 키도 같은 종류였다). 구분 자체를 없앴다.

- `/api/its-key` — 런타임에 키를 읽어 브라우저로 넘긴다.
  `ITS_API_KEY`·`NEXT_PUBLIC_ITS_API_KEY` **둘 다** 읽어 이름 때문에 다시 실패하지 않게 한다.
- 클라이언트는 빌드에 박힌 값이 있으면 그것을 쓰고(로컬), 없으면 이 라우트에서 받는다.
  받은 키는 모듈 스코프에 캐시하되 **실패한 약속은 지운다** — 남기면 이후 조회가 영구히 막힌다.

어차피 공개되는 값이라 노출 수준은 같다. 오히려 정적 번들에 박히는 것보다 낫다 —
`guardProxyRequest`의 출처 검사와 레이트리밋이 걸린다.

#### 실측

| 시험 | 결과 |
| --- | --- |
| `/api/its-key` 정상 호출 | ✅ 키 32자 반환, 공백 없음 |
| 외부 Origin | ✅ 403 차단 |
