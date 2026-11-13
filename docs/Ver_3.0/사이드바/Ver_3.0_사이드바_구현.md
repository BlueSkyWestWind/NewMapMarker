# Ver 3.0 사이드바 구현

근거: `Ver_3.0_계획.md` 10장. 시안: [MapMarker 사이드바 디자인안](https://claude.ai/artifact/Fb9TsUBGmVwYBxR6yRJ2ov).

## 결정

강조색 인디고, 트리 옆 상세 패널, 장소 검색은 상단 검색바로 일원화, 레일·트리·패널·시트는 직접 구현.

## 구조

| 파일 | 역할 |
|---|---|
| `shell/lib/nav-model.ts` | 하위 메뉴, 설명, 모바일 탭, 메뉴 검색 (순수) |
| `shell/lib/sheet-snap.ts` | 시트 높이 계산 (순수) |
| `shell/constants.ts` | 폭 상수, `mapLeftOffsetPx` (순수) |
| `shell/store/use-shell-store.ts` | 트리 펼침, 패널 단계, 시트 높이, 더보기. persist 안 함 |
| `shell/hooks/use-shell-nav.ts` | 메뉴 이동 동작. 기존 `setActiveNav`·`setMapSegment`·`setMode`를 그대로 호출 |
| `shell/components/nav-rail.tsx` | 56px 레일 |
| `shell/components/nav-tree.tsx` | 256px 트리 |
| `shell/components/account-menu.tsx` | 계정 이메일과 로그아웃 |
| `shell/components/work-panel.tsx` | 데스크톱 패널 (첫 단계·상세 단계) |
| `shell/components/panel-body.tsx` | 메뉴별 기존 패널 내용. 데스크톱과 모바일이 함께 사용 |
| `shell/components/mobile-shell.tsx` | 하단 메뉴와 시트 |
| `hooks/use-is-mobile.ts` | 768px 미만 판정 |

## 동작

- **메뉴 표기, 비로그인 숨김과 위치·변환기 잠금, 패널 지연 로딩:** 그대로 둔다.
- **패널:** 하위 메뉴가 있는 메뉴(지도, 마커관리)는 첫 단계에서 목록을 보여 주고, 고르면 상세 단계로 간다. 없는 메뉴는 바로 내용을 보여 준다.
- **첫 단계 검색:** 기존 `markerListFilter`를 쓴다. Enter를 누르면 상세 단계의 위치 찾기 목록으로 간다.
- **트리:** 하위 메뉴를 누르면 트리 옆에 상세 패널이 열린다. 왼쪽 폭은 636px이고 X로 닫는다.
- **장소 검색:** 패널에서 빼고 `place-search-section.tsx`를 지운다. 상단 검색바와 같은 훅을 쓰던 중복 화면이다.
- **세그먼트 탭:** 하위 메뉴로 대체되므로 `mode-tabs.tsx`를 지운다.
- **모달 위치:** `cctv-video-modal.tsx`와 `barcode-lightbox.tsx`는 `mapLeftOffsetPx`를 쓴다. 모바일은 0이다.

## 모바일(768px 미만)

- **하단 메뉴:** 대시보드, 지도, 마커관리, 일정관리, 더보기. 더보기에 그룹관리, 바코드/QR, 데이터백업/복원, 설정, 계정설정. (CCTV는 지도 하위 세그먼트로 통합, 2026-11-08)
- **시트:** 낮음 76px, 절반은 지도 영역의 50%, 전체는 지도 영역에서 8px을 뺀 높이. 손잡이를 끌면 가까운 높이로 맞추고, 누르면 다음 높이로 바뀐다.
- **높이 변경:** 첫 화면은 낮음. 다른 탭은 절반, 활성 탭을 다시 누르면 낮음. 바코드/QR은 전체. 마커나 장소를 고르거나 위치등록의 지도 찍기를 시작하면 낮음.
- **지도:** 시트와 달리 모달이 아니므로 시트가 열려 있어도 지도를 조작할 수 있다.

## 번들

홈 기준(295 kB)을 지키기 위해 지연 로딩한다. 트리, 모바일 메뉴와 시트, CCTV·백업·설정 패널. 적용 후 288 kB(2026-11-07).

`@mihcm/ui`의 부품은 쓰지 않아 패키지를 제거했다. 레일·트리·패널은 B안대로 직접 구현했고, `Sheet`는 모달형이라 지도와 함께 쓸 수 없다.

## 미루는 것

- **임시 마커 기능 이동(계획서 2장):** 이번 범위가 아니다.

## 검증

단위 테스트(메뉴 모델, 시트 높이, 왼쪽 폭), `tsc`, `eslint`, `npm test`, `next build`, 홈 번들 295 kB 이하, 데스크톱·모바일 화면 확인. 확인 필요: 가상 키보드, 노치 영역, 시트 안 필터 드롭다운.
