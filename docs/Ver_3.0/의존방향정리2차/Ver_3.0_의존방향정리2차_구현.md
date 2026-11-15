# 의존 방향 정리 2차 (구현)

구현일 2026-11-15 · 설계: [Ver_3.0_의존방향정리2차_설계.md](Ver_3.0_의존방향정리2차_설계.md) · 계획: [Ver_3.0_의존방향정리2차_구현계획.md](Ver_3.0_의존방향정리2차_구현계획.md)

피처 사이에 새 의존이 생기지 않게 **래칫 가드**를 `src/lib/arch-guard.test.ts`에 추가했다. 셸 내비 상태 분리는 구현 전에 철회했다(아래 "계획과 다르게 한 것"). 구현은 agy가 하고 Claude가 diff와 가드 동작을 검토했다. 소스(`src/features/**`)는 이 작업에서 한 줄도 바꾸지 않았다.

## 직접 하실 일

없다. 테스트 파일 하나만 바뀌었고 화면에 영향이 없다. 확인할 결정은 아래 "후속 제안"에 있다(해도 되고 안 해도 된다).

## 한 일

`src/lib/arch-guard.test.ts`에 테스트 2개를 더했다(기존 `no-lib-to-feature` 테스트는 그대로).

| 테스트 | 내용 |
|---|---|
| `feature-edges: 허용 목록과 현재 의존이 같다` | `src/features/A/**`(테스트 파일 제외, 주석 줄 제외)가 `@/features/B/`를 `from`·`import()`로 가져오는 모든 쌍 `A->B`를 수집해 `ALLOWED_FEATURE_EDGES`와 비교한다. 목록에 없는 새 쌍은 `새 의존: A->B (근거 파일)`로, 목록에만 남은 쌍은 `해소된 의존: A->B (목록에서 지운다)`로 실패한다 |
| `feature-edges: 양방향 쌍은 늘지도 줄지도 않는다` | A->B와 B->A가 모두 있는 쌍의 수가 `MAX_BIDIRECTIONAL_PAIRS`(현재 13)와 다르면 실패한다. 줄었을 때는 값을 낮추라는 메시지가 나온다 |

허용 목록 37쌍은 현재 코드에서 수집했고, 쌍마다 근거 파일을 읽고 한 줄 이유를 적었다. Claude가 7쌍을 골라 import 줄과 대조했고 모두 맞았다.

## 현재 의존 지도

양방향 쌍 13개(괄호는 한쪽 방향 근거 건수 예):

| 구분 | 쌍 |
|---|---|
| 셸이 들어간 쌍 (7) | `barcode`·`cctv`·`dashboard`·`group-admin`·`map-marker`·`schedule`·`site-lists` ↔ `shell` |
| `map-marker`가 들어간 쌍 (7, 위와 `map-marker<->shell` 중복) | `cctv`·`gpsmap`·`group-admin`·`route`·`shell`·`site-lists`·`worksite-weather` ↔ `map-marker` |

- **`shell`이 들어간 쌍은 구조가 같다.** `shell`이 패널들을 지연 로드하는 조립 지점(`AppShell`·`PanelBody`)이고, 반대로 패널들이 `shell`의 UI 조각(`PanelSection`)·지도 오프셋 훅(`useMapLeftOffset`)·폭 상수를 쓴다.
- **`map-marker`가 들어간 쌍**은 `map-marker`가 지도 호스트이면서 데이터·타입 창구라서 생긴다(`group-admin->map-marker` 33건, `shell->map-marker` 22건, `dashboard->worksite-weather` 15건이 가장 많다).

## 계획과 다르게 한 것

| # | 계획 | 한 것 | 이유 |
|---|---|---|---|
| 1 | 내비 상태(`activeNav`·`mapSegment`)를 새 persist 스토어 `use-nav-store.ts`로 분리 | **하지 않았다.** 계획·설계에서 철회했다 | 구현을 맡기기 전에 `use-map-marker-store.ts`의 `setActiveNav`·`setMapSegment`를 읽었다. 두 setter가 `mode`·`mapSegment`·필터·`selectionByNav`·`selectedMarkerIds`·`isMarkersVisible`·CCTV 상태를 한 번의 `set`으로 함께 바꾼다. 스토어를 둘로 나누면 갱신이 원자적이지 않고, `mode`(`map-marker-ui`)와 내비(`nav-ui`)가 따로 persist되어 어긋난 채 복원될 수 있다. 이득도 작다(`map-marker`→`shell`에는 `AppShell`·폭 상수 import도 남는다). 설계 §3.2에 근거와 재시도 조건을 적었다 |

초기 설계의 추천(대안 A)이 틀렸고, 설계 단계에서 setter를 읽지 않은 것이 원인이다.

## 검토에서 확인한 것

- agy 보고: 소스 무변경. `git diff --stat -- src/features`에 나오는 3개 파일은 앞선 작업(대형파일분할2차·캡처 지연 로드)의 미커밋 변경이고 이번 작업이 아니다.
- **가드가 실제로 동작하는지 Claude가 직접 실험했다.** `cctv`에 `@/features/barcode/...`를 import하는 가짜 파일을 임시로 만들었더니 `새 의존: cctv->barcode (…:1)`로 실패했고, 지운 뒤 4개 모두 통과했다. agy도 세 가지 실험(쌍 삭제 → `새 의존`, 가짜 import → `새 의존`, 없는 쌍 추가 → `해소된 의존`)의 실패 메시지를 보고했다.

## 검증

| 명령 | 결과 |
|---|---|
| `npx vitest run src/lib/arch-guard.test.ts` | 4개 통과 |
| `npx tsc --noEmit` | 오류 0건 |
| `npx eslint . --max-warnings=0` | 오류 0건 |
| `npm test` | 154개 파일 통과, 1개 스킵 / 1,794개 통과, 3개 스킵 |

## 한계와 후속 제안

- 가드는 **새로 늘어나는 것만** 막는다. 기존 13개 양방향 쌍은 그대로다.
- **후속 제안(효과 큼, 위험 낮음): `shell`의 공용 UI 조각을 `shell` 밖으로 옮긴다.** `PanelSection`, `useMapLeftOffset`, 폭 상수(`shell/constants.ts`)를 공용 위치로 옮기면, `barcode`·`cctv`·`dashboard`·`group-admin`·`schedule`·`site-lists`가 `shell`을 거꾸로 import하는 6개 방향이 사라진다. 그러면 양방향 쌍이 13 → 7쯤으로 줄고 `MAX_BIDIRECTIONAL_PAIRS`와 허용 목록도 줄일 수 있다. 다만 AGENTS.md가 "폭 상수는 `features/shell/constants.ts` 단일 소스"로 정해 두었으므로 파일을 통째로 옮기고 규칙 문구도 고쳐야 한다(사용자 확인 필요). 원하시면 설계부터 쓰겠다.
- `map-marker`가 들어간 쌍(7개)은 상태 구조와 얽혀 있어 인터페이스 주입이나 메뉴 전환 규칙의 순수 함수화가 먼저 필요하다. 이번 범위가 아니다.
