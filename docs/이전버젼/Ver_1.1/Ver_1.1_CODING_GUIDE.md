# Ver_1.1 코딩 가이드 (Coding Guide)

- 제품: **MapMarker Pro** (`0004_NewMapMarker`)
- 문서 버전: **Ver_1.1**
- 최종 갱신: 2026-07-26
- 상위 규칙: `AGENTS.md` · `.agents/AGENTS.md`
- 관련 문서: [ARCHITECTURE](./Ver_1.1_ARCHITECTURE.md) · [STATE](./Ver_1.1_STATE.md) · [TEST_CASE](./Ver_1.1_TEST_CASE.md)

---

## 1. 기술 스택 고정

| 영역 | 고정 |
| --- | --- |
| 프레임워크 | Next.js 15 App Router |
| 언어 | TypeScript (strict, `any` 금지) |
| 스타일 | Tailwind + shadcn/ui |
| 상태 | Zustand + TanStack Query |
| DB | Supabase (anon + RLS) |
| 배포 | Cloudflare Workers (OpenNext) |
| 테스트 | Vitest + Playwright |

**Ver_1.1에서 신규 npm 의존성은 추가하지 않았다.** 기상 연동은 `fetch`만 사용한다.
새 라이브러리를 넣기 전에 `.agents/AGENTS.md §4` 의존성 실사를 거친다.

## 2. 명명 규칙

| 대상 | 규칙 | 예 |
| --- | --- | --- |
| 파일 | kebab-case | `parse-wrn-text.ts` |
| 타입·인터페이스 | PascalCase | `WeatherSlot` |
| 함수·변수 | camelCase | `getVilageBaseForToday` |
| 상수 | UPPER_SNAKE | `HEAT_THRESHOLDS` |
| 테스트 | `*.test.ts` | `verdict.test.ts` |

**식별자는 영어, 주석·문서는 한글.**

> `vitest.config.ts`의 `include`가 `src/**/*.{test,spec}.ts`다. **`.tsx` 테스트는 실행되지 않는다.**

## 3. 디렉터리 규칙

```
features/{feature}/
├── components/   화면
├── hooks/        React 상태·부수효과
├── lib/          순수 함수·DOM 빌더·외부 호출
├── constants/    임계값·매핑
└── types/        타입 + 표기 상수
```

| 규칙 | 내용 |
| --- | --- |
| DIR-1 | `lib/`는 `hooks/`·`components/`를 import하지 않는다 |
| DIR-2 | 서버 전용 모듈은 `import "server-only"` |
| DIR-3 | feature 간 참조는 단방향 |
| DIR-4 | 표기 상수(아이콘·라벨·색)는 `types/`에 한 벌만 |

> **DIR-1 위반 사례**: `map-marker/lib/overlay-content.ts` → `worksite-weather/hooks/...`
> 요청 함수를 `lib/worksite-weather-api.ts`로 옮겨 해소했다.

## 4. TypeScript

| 규칙 | 내용 |
| --- | --- |
| TS-1 | `any` 금지. 불가피하면 `unknown` + 좁히기 |
| TS-2 | 공개 함수는 반환 타입 명시 |
| TS-3 | 유니온에 값 추가 시 `.exhaustive()` 지점을 전부 처리 |
| TS-4 | 타입만 쓰면 `import type` (런타임 의존 제거) |
| TS-5 | **커밋 전 `tsc --noEmit`** — vitest는 타입을 보지 않는다 |

### 4.1 `MapMode` 확장 시

`.exhaustive()` 2곳(`getPendingKey`, `countLabel`)을 반드시 처리한다. 누락 시 런타임 throw.

## 5. React

| 규칙 | 내용 |
| --- | --- |
| R-1 | 파생 가능한 값을 `useState`로 두지 않는다 |
| R-2 | **`useEffect`로 사용자 선택을 덮어쓰지 않는다** |
| R-3 | 초기화는 effect보다 **이벤트 핸들러** 우선 |
| R-4 | 같은 state를 쓰는 effect가 2개 이상이면 설계를 다시 본다 |
| R-5 | 모달 인스턴스는 한 곳에서만 소유 |
| R-6 | 비동기 응답을 DOM에 쓸 때 마운트 여부 확인 |
| R-7 | 비동기 핸들러는 `.catch()`로 피드백 |

> **R-2 위반 사례**: 날씨 패널에서 effect 3개가 각자 `setSite`를 호출해
> 사용자가 고른 국소가 검색어 변경 시 첫 항목으로 되돌아갔다.
> eslint `exhaustive-deps`는 이를 잡지 못했다. **린트를 안전망으로 믿지 않는다.**

## 6. 번들 관리 (Ver_1.1 신설)

| 규칙 | 내용 |
| --- | --- |
| B-1 | 100 kB 이상 라이브러리는 **사용 시점 `await import`** |
| B-2 | 상수·타입만 필요하면 모듈을 분리한다 |
| B-3 | 항상 마운트되는 컴포넌트에서 무거운 모듈을 정적 import 하지 않는다 |
| B-4 | 기능 추가 후 `next build`로 First Load 변화를 확인한다 |

### 6.1 지연 로딩 대상

| 모듈 | 크기 | 트리거 |
| --- | --- | --- |
| `xlsx` | 1.26 MB | 엑셀 업로드·백업·TBM 저장 |
| `html2canvas` | ~190 KB | 지도 캡처 |
| `jszip` | — | 영역 캡처 zip |
| `leaflet` | — | `/gpsmap` |

> **B-2 사례**: `full-backup.ts`가 xlsx를 정적으로 끌어오는데 백업 훅은 상수·타입만 필요했다.
> `full-backup-schema.ts`(xlsx 무의존)를 분리해 홈 번들에서 SheetJS를 제거했다.

### 6.2 확인 방법

```bash
npm run build
node -e "const m=require('./.next/app-build-manifest.json');const fs=require('fs');
for(const c of m.pages['/page']) if(/SheetJS|html2canvas/.test(fs.readFileSync('.next/'+c,'utf8'))) console.log(c);"
```

## 7. 데이터 접근

| 규칙 | 내용 |
| --- | --- |
| D-1 | 전량 조회는 **`fetchAllRows`** 사용. `select('*')` 단발 금지 |
| D-2 | 페이징하는 쿼리의 정렬에는 **유일 키 tiebreaker** 필수 |
| D-3 | 컬럼 추가 시 `api.ts` 매핑 + 타입 + **백업 열 목록** 동시 갱신 |
| D-4 | 신규 컬럼은 optional로 읽어 마이그레이션 미적용 DB에서도 동작하게 |

## 8. 도메인 로직 작성

| 규칙 | 내용 |
| --- | --- |
| L-1 | 판정 임계값은 `constants/`에만. 함수에 숫자를 직접 쓰지 않는다 |
| L-2 | **결측 시 추정값을 만들지 않는다.** null·`unknown`을 유지 |
| L-3 | 외부 응답 파싱 실패 시 조용히 빈 결과를 내지 않는다 |
| L-4 | 범위값(`1.0~29.9mm`)은 안전측(상한)을 채택 |
| L-5 | 시간 계산은 KST 보정 함수 경유. `getHours()` 직접 사용 금지 |
| L-6 | 순수 함수로 먼저 만들고 **테스트를 먼저 쓴다** |

## 9. 외부 API 연동

| 규칙 | 내용 |
| --- | --- |
| E-1 | 문서 스펙만 믿지 말고 **실응답을 확인**한다 |
| E-2 | 인코딩을 확인한다 (기상청 typ01은 EUC-KR) |
| E-3 | 오류 코드별로 **원인이 다르면 안내도 달라야 한다** (401 ≠ 403) |
| E-4 | 업스트림 원문 메시지를 그대로 노출하지 않는다 |
| E-5 | `AbortSignal.timeout()` 필수 |
| E-6 | 부분 실패를 전체 실패로 만들지 않는다 |

> **E-1 사례**: 기상청 DB 스키마 문서의 특보 코드(`W`/`1`/`1`)와
> 실제 `wrn_now_data.php` 응답(`폭염`/`경보`/`변경`)이 달랐다.

## 10. 오류 처리 · 사용자 피드백

| 상황 | 처리 |
| --- | --- |
| 예상 가능한 실패 | 한국어 메시지 + 조치 안내 |
| 비JSON 응답 | 텍스트로 먼저 읽고 파싱 시도 (`Unexpected token` 노출 금지) |
| 부분 실패 | 결과는 주되 `warnings`로 고지 |
| 확인 불가 | **"없음"으로 표시하지 않는다** |

## 11. 마이그레이션

| 규칙 | 내용 |
| --- | --- |
| MG-1 | 파일명 `YYYYMMDDHHMMSS_설명.sql` |
| MG-2 | **재실행 안전** (`IF NOT EXISTS`) |
| MG-3 | 끝에 `NOTIFY pgrst, 'reload schema';` |
| MG-4 | 앱은 미적용 상태에서도 조회가 깨지지 않아야 한다 |
| MG-5 | 배포 전 실행. 앱의 방어 로직에 의존하지 않는다 |

## 12. 문서 동기화 의무

| 변경 | 갱신 대상 |
| --- | --- |
| 스키마 | DATABASE · IA §5 · BUSINESS_RULE |
| 라우트 | API · ARCHITECTURE |
| 상태 | STATE · IA §7 |
| 컴포넌트 | COMPONENT · DESIGN |
| 도메인 규칙 | BUSINESS_RULE · TEST_CASE |
| 릴리스 | CHANGELOG · PLAN |

구현·기능 추가 시 `docs/implementation_plan.md`(코딩 전)와 `docs/walkthrough.md`(완료 후)를 **상단 누적**한다.

## 13. 커밋 · PR

| 규칙 | 내용 |
| --- | --- |
| G-1 | 커밋 메시지 **한글** + `feat:`/`fix:`/`refactor:`/`docs:`/`test:`/`chore:` |
| G-2 | 커밋 전 시크릿 스캔 (`sk-`·`AKIA`·`ghp_`·PRIVATE KEY·`*_KEY=`) |
| G-3 | `.env*`는 절대 커밋하지 않는다 |
| G-4 | 인증키를 `wrangler.jsonc`의 `vars`에 넣지 않는다 (커밋된다) |
| G-5 | 무단 커밋·push 금지. 사용자 요청 시에만 |

## 14. 릴리스 게이트

```bash
npx tsc --noEmit     # ← 반드시 포함. vitest가 대신하지 못한다
npx eslint .
npx vitest run
npm run build        # First Load 확인
```

전부 통과 + [TEST_CASE §6](./Ver_1.1_TEST_CASE.md) 수동 체크리스트.

## 15. 자주 하는 실수

| 실수 | 결과 |
| --- | --- |
| 상태 추가하며 기존 필드 선언 삭제 | 빌드 붕괴 (Ver_1.1 실제 발생) |
| 표기 상수를 컴포넌트에 재정의 | 같은 등급이 화면마다 다른 이름 |
| `Number(null)` 검증 | `0`이라 미지정이 좌표 (0,0)으로 통과 |
| `select('*')` 단발 | 행 상한 초과 시 조용히 잘림 |
| 항상 마운트되는 곳에서 무거운 모듈 정적 import | 홈 번들 급증 |
| `.tsx`로 테스트 작성 | 실행되지 않음 |
| `getHours()` 사용 | 배포(UTC) 후에만 실패 |
| 문서 스펙만 보고 파서 작성 | 실응답과 불일치 |
| eslint 통과를 안전 근거로 삼음 | `exhaustive-deps`가 못 잡는 경우 있음 |
