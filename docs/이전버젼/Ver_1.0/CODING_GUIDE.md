# 코딩 가이드 (Coding Guide)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 문서 버전: **Ver_1.0**
- 최종 갱신: 2026-07-25
- 관련 문서: [ARCHITECTURE](./ARCHITECTURE.md) · [COMPONENT](./COMPONENT.md) · [STATE](./STATE.md) · [BUSINESS_RULE](./BUSINESS_RULE.md)

---

## 1. 기술 스택 고정

| 영역 | 선택 | 버전 |
| --- | --- | --- |
| 프레임워크 | Next.js (App Router) | 15.5 |
| 언어 | TypeScript | 5 |
| UI | React | 19 |
| 스타일 | Tailwind CSS | 3.4 |
| 컴포넌트 | shadcn/ui (Radix) | — |
| UI 상태 | Zustand | 4 |
| 서버 상태 | TanStack Query | 5 |
| 폼 | react-hook-form + zod | — |
| 엑셀 | SheetJS `xlsx` | **0.20.3 (CDN tarball 고정)** |
| 아이콘 | lucide-react | — |
| 런타임 | Node | **22 (.nvmrc)** |
| 배포 | Cloudflare Workers + OpenNext | wrangler 4.x |

> 스택 추가는 번들 크기(NFR-07)에 직접 영향을 준다. 새 라이브러리 도입 시 홈 First Load 변화량을 PR에 기재한다.

## 2. 명명 규칙

| 대상 | 규칙 | 예 |
| --- | --- | --- |
| 파일 | kebab-case | `marker-detail-modal.tsx` |
| 컴포넌트 | PascalCase | `MapSidebar` |
| 훅 | `use-` 접두 파일 / `useXxx` 함수 | `use-active-markers.ts` |
| 상수 | UPPER_SNAKE | `DEFAULT_MAP_LEVEL` |
| DB 컬럼 | snake_case | `parent_marker_id` |
| TS 필드 | camelCase | `parentMarkerId` |
| 쿼리 키 | 배열 상수 | `["map-marker","markers"]` |
| 테스트 | `*.test.ts` 동일 디렉터리 | `marker-filters.test.ts` |
| 마이그레이션 | `YYYYMMDDHHMMSS_설명.sql` | `20260723000000_add_group_key.sql` |

**변환 경계**: snake ↔ camel 변환은 `features/map-marker/api.ts`에서만 한다. 다른 파일에 snake_case 프로퍼티가 등장하면 경계가 새고 있다는 신호다.

## 3. 디렉터리 규칙

```
src/
├── app/          라우트·레이아웃·Providers·API 라우트
├── components/   전역 인프라 + ui/(shadcn 원시)
├── features/     도메인 단위 (map-marker, gpsmap)
│   └── <feature>/
│       ├── api.ts        데이터 접근 경계
│       ├── types/        도메인 타입
│       ├── constants/    고정값
│       ├── store/        Zustand
│       ├── hooks/        훅
│       ├── lib/          순수 도메인 로직 (테스트 대상)
│       └── components/   map · sidebar · modals
├── hooks/  lib/  types/  전역 공용
└── lib/supabase/client.ts
```

| 규칙 | 내용 |
| --- | --- |
| D-1 | 기능 코드는 `features/<feature>/` 안에 둔다. 전역에 흩뿌리지 않는다 |
| D-2 | `components/ui/`는 도메인 타입을 import하지 않는다 |
| D-3 | `lib/`은 순수 함수 중심. React·스토어를 import하지 않는다 |
| D-4 | 두 feature가 공유하는 코드만 최상위 `lib/`·`types/`로 올린다 |

## 4. TypeScript

| ID | 규칙 |
| --- | --- |
| TS-1 | **`any` 금지.** 불가피하면 `unknown` + 좁히기. 잔존 `any`는 부채로 추적한다(R3/R5) |
| TS-2 | 외부 SDK 타입은 `types/`에 선언을 모아둔다. 인라인 캐스팅을 흩뿌리지 않는다 |
| TS-3 | 유니온은 문자열 리터럴로 표현한다 (`'장비' \| '축전지' \| '위치'`) |
| TS-4 | 함수 반환 타입은 공개 API 성격일수록 명시한다 |
| TS-5 | `as` 단언보다 타입 가드 함수를 우선한다 |
| TS-6 | nullable 좌표(`lat`/`lng`)는 옵셔널이 아니라 `number \| null`로 정직하게 표현한다 |

## 5. React

| ID | 규칙 |
| --- | --- |
| R-1 | 컴포넌트는 표현에 집중한다. 도메인 계산은 `lib/`로 옮긴다 |
| R-2 | `useEffect`로 파생 상태를 만들지 않는다. 계산으로 유도하고 메모이제이션한다 |
| R-3 | 서버 데이터를 스토어에 복사하지 않는다([STATE §7](./STATE.md)) |
| R-4 | 이벤트 리스너·지도 오버레이는 언마운트에서 반드시 해제한다 |
| R-5 | 무거운 컴포넌트는 `next/dynamic`으로 감싼다 |
| R-6 | 파일이 500줄을 넘으면 분할을 검토한다 (현행 최대: `marker-detail-modal.tsx` 2,006줄 — 부채 G1) |
| R-7 | 조건부 렌더는 이른 반환으로 평탄화한다. 3중 이상 중첩 삼항 금지 |

## 6. 스타일 (Tailwind)

| ID | 규칙 |
| --- | --- |
| ST-1 | 시맨틱 토큰(`bg-background`, `text-foreground`)을 우선한다 |
| ST-2 | 브랜드 색은 `slate` / `indigo` 램프를 통해 쓴다. **하드코딩 hex 금지** |
| ST-3 | 예외: **시설팀 색 6종·상태 색 4종**은 `constants/facility-teams.ts`의 고정 hex를 사용한다(BR-C01) |
| ST-4 | 표에는 `whitespace-nowrap` 필수. 가로 스크롤 금지(BR-U01/U02) |
| ST-5 | 엘리베이션은 그림자가 아니라 `shadow-glow` / `shadow-glow-sm`로 표현한다 |
| ST-6 | 임의값(`text-[11px]`)은 DESIGN §3에 정의된 것만 사용한다 |
| ST-7 | 애니메이션은 200ms를 넘기지 않는다 |

## 7. 상태

| ID | 규칙 |
| --- | --- |
| S-1 | 서버에 있는 값 → TanStack Query / 없는 값 → Zustand |
| S-2 | 한 컴포넌트에서만 쓰는 값은 `useState`로 두고 스토어에 올리지 않는다 |
| S-3 | persist 대상 추가는 [STATE §2.2](./STATE.md) 기준을 충족할 때만 한다 |
| S-4 | 변경 동작 후 쿼리 무효화를 **명시적으로** 호출한다 |
| S-5 | 낙관적 업데이트는 그룹 조작 영역에서 사용하지 않는다(롤백 불가) |

## 8. 오류 처리 · 사용자 피드백

| ID | 규칙 |
| --- | --- |
| E-1 | 실패는 **숫자와 대상 목록**으로 알린다. "실패했습니다"로 끝내지 않는다 |
| E-2 | 부분 실패는 성공 건수와 함께 보고한다 |
| E-3 | 복구 방법을 문장에 넣는다 (예: 마이그레이션 파일명, 재시도 안내) |
| E-4 | 진행 중에는 처리 건수/전체 건수를 표시한다 |
| E-5 | 오류 메시지는 한국어로 쓰고, 내부 스택·키를 노출하지 않는다 |
| E-6 | `catch` 후 무시(swallow) 금지. 최소한 사용자 안내나 로그를 남긴다 |

## 9. 도메인 로직 작성

| ID | 규칙 |
| --- | --- |
| L-1 | 그룹 판정·필터·좌표 변환은 **순수 함수**로 작성하고 단위 테스트를 붙인다 |
| L-2 | 규칙을 바꿀 때는 [BUSINESS_RULE](./BUSINESS_RULE.md)의 해당 `BR-*` 항목을 **같은 PR에서** 갱신한다 |
| L-3 | 같은 규칙을 두 곳에 구현하지 않는다 (현행 위반: 유효 키 G2 → [CR-002](./CHANGE_REQUEST/CR-002.md)) |
| L-4 | 결정적이어야 하는 판정(대표 승격)에 `Math.random`·현재 시각을 쓰지 않는다 |
| L-5 | 다단계 DB 갱신은 **실패해도 정합성이 덜 깨지는 순서**로 배열한다(BR-G05) |

## 10. 마이그레이션

| ID | 규칙 |
| --- | --- |
| M-1 | 파일명은 타임스탬프 접두. 적용 순서 = 파일명 순서 |
| M-2 | `IF NOT EXISTS` 등으로 **재실행 안전**하게 작성한다 |
| M-3 | 컬럼 추가는 nullable 또는 기본값을 동반한다 |
| M-4 | 컬럼 부재 시 앱이 **파일명을 안내**하도록 대응 코드를 함께 넣는다 |
| M-5 | 파괴적 변경 전에는 백업 절차를 문서에 명시한다 |

## 11. 문서 동기화 의무

코드를 바꾸면 **같은 PR에서** 해당 문서를 갱신한다.

| 변경 | 갱신 문서 |
| --- | --- |
| 도메인 규칙 | BUSINESS_RULE |
| 스키마·마이그레이션 | DATABASE (+ Ver_1.0_IA §5) |
| 컴포넌트 추가/분할 | COMPONENT |
| 스토어 키·쿼리 키 | STATE |
| 라우트·프록시 | API |
| 색·간격·타이포 | Ver_1.0_DESIGN |
| 기능 추가 | Ver_1.0_PRD (FR) + Ver_1.0_USECASE (UC) |
| 릴리스 | CHANGELOG |

## 12. 커밋 · PR

### 커밋 메시지

```
<type>: <한국어 요약>

feat     기능 추가
fix      버그 수정
refactor 동작 변화 없는 구조 개선
docs     문서
test     테스트
chore    빌드·설정
perf     성능
```

### PR 체크리스트

- [ ] `npx tsc --noEmit` 오류 0
- [ ] `npx eslint .` 문제 0  ← **`next build`는 lint를 건너뛰므로 반드시 별도 실행**
- [ ] `npx vitest run` 전량 통과
- [ ] `npm run build` 성공
- [ ] 홈 First Load 482 kB 유지 (증가 시 원인 명시)
- [ ] 표 줄바꿈·가로 스크롤 규칙 준수
- [ ] 아이콘 버튼 `title` / 슬라이더 `aria-label`
- [ ] 로딩·빈 결과·부분 실패 문구 정의
- [ ] 도메인 규칙 변경 시 BUSINESS_RULE 갱신
- [ ] 스키마 변경 시 마이그레이션 + DATABASE 갱신
- [ ] 신규 프록시 호스트 시 allowlist + `proxy-guard` 테스트

## 13. 릴리스 게이트

| 게이트 | 명령 | 기준 |
| --- | --- | --- |
| 타입 | `tsc --noEmit` | 오류 0 |
| 정적분석 | `eslint .` | 문제 0 |
| 단위 | `vitest run` | 전량 통과 (현행 4 files / 39 tests) |
| 빌드 | `next build` | 성공 |
| E2E | `playwright test` | 스모크 통과 |
| 수동 | 체크리스트 | 백업 왕복 · 그룹 분리/원복 · 캡처 PNG |

## 14. 자주 하는 실수

| 실수 | 결과 | 예방 |
| --- | --- | --- |
| `next build`만 돌리고 lint 통과로 착각 | 정적분석 누락 | `eslint .` 별도 실행 |
| 유효 키 함수를 한쪽만 수정 | 화면마다 그룹이 달라짐 | 두 구현 동시 수정(G2) |
| 서버 키에 `NEXT_PUBLIC_` 접두 | **키 유출** | REST 키는 서버 전용 |
| 마이그레이션 없이 컬럼 사용 | 운영 오류 | 마이그레이션 + 안내 문구 |
| 쿼리 무효화 누락 | 편집이 화면에 반영 안 됨 | 변경 훅에서 명시 호출 |
| 표에 `whitespace-normal` | 프로젝트 규칙 위반 | 폭을 넓히는 방향으로 해결 |
| 그룹 조작 순서 변경 | dangling parent 발생 | BR-G05 순서 고정 |
