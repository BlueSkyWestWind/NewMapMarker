# 현장실사서 → 세부 시트 정리 (구현)

구현일 2026-11-13 · 설계: [Ver_3.0_현장실사서_세부정리_설계.md](Ver_3.0_현장실사서_세부정리_설계.md) · 계획: [Ver_3.0_현장실사서_세부정리_구현계획.md](Ver_3.0_현장실사서_세부정리_구현계획.md)

공정관리 > 현장실사서 화면과 환경설정 창을 만들었다. 실사서 엑셀을 올리면 세부 시트와 같은 열 구성의 결과 엑셀을 내려받는다. **커밋하지 않았다.**

## 직접 하실 일

1. **마이그레이션 적용**: `supabase/migrations/20261117000200_survey_settings.sql`을 Supabase SQL Editor에서 실행한다. 적용 전에는 기본 설정으로 동작하고 설정 저장만 막힌다(화면에 안내가 보인다).
2. **권한 확인(적용 뒤)**: ① 일반 계정으로 설정 저장이 거부되는지(UI가 아니라 DB가 막는지) ② 관리자 계정으로 저장되는지 ③ 비로그인은 읽지 못하는지. 결과를 설계 §8.2에 적는다.
3. **화면 눈으로 확인**: 로그인해서 `공정관리 > 현장실사서`를 열어 본다. 개발 서버에서 로그인 없이 임시 페이지로는 확인했다(아래).
4. **프로젝트에 생긴 `.agents/skills/unslop`, `.claude/skills/unslop`, `skills-lock.json`**(unslop 설치로 생김)을 남길지 정한다. `.agents/skills/unslop/scripts/story.mjs`가 `npx eslint .`에서 미사용 import 오류를 낸다. `src`는 오류 없음.
5. 화정아이파크 101동 엑셀을 받으면 인빌딩 규칙을 한 건 더 확인한다(설계 §5의 10번).

## 만든 것

| 영역 | 파일 |
|---|---|
| 타입·상수 | `src/features/site-survey/types.ts`, `constants/{detail-columns,survey-fields,default-settings}.ts` |
| 로직(순수, 테스트 있음) | `lib/{station-rules,transforms,parse-survey,notes,settings-schema,build-rows,export-workbook,settings-draft,merge-docs}.ts` |
| 설정 저장 | `supabase/migrations/20261117000200_survey_settings.sql`, `api.ts`, `hooks/use-survey-settings.ts` |
| 화면(Astryx) | `components/{site-survey-main,survey-result-table,survey-field-checklist,survey-settings-dialog,survey-settings-tabs,survey-settings-editors,survey-theme}.tsx`, `hooks/use-survey-files.ts` |
| 메뉴 | `shell/types/{nav,segment}.ts`, `shell/lib/nav-model.ts`, `shell/components/{nav-tree,panel-body,app-shell}.tsx`, `shell/hooks/use-shell-nav.ts`, `map-marker/store/use-map-marker-store.ts` |
| 스타일 설정 | `postcss.config.mjs`, `postcss-unlayer-astryx.cjs` |
| 의존성 | `@astryxdesign/core`, `@astryxdesign/theme-neutral`, `@astryxdesign/cli`, `@stylexjs/stylex` |

## Astryx를 이 프로젝트에 넣은 방법

- **화면 안에서만 쓴다.** `survey-theme.tsx`가 `astryx.css`·`theme.css`를 불러오고, 화면 전체가 `dynamic()`이라 홈 번들·홈 HTML의 CSS에는 들어가지 않는다. 앱의 `globals.css`·Tailwind 설정은 건드리지 않았다. Astryx 변수 416개는 앱이 쓰는 변수와 이름이 겹치지 않는다.
- **Tailwind v3 충돌과 해결**: 앱의 Tailwind v3 프리플라이트(`*{border:0}`, `button{background:transparent}`)는 계층 밖에서 나와, 계층 안의 Astryx 스타일을 이긴다(버튼 배경·입력 테두리가 사라졌다). `postcss-unlayer-astryx.cjs`가 **`@astryxdesign` 경로의 CSS에서만** `@layer` 껍데기를 벗겨 해결했다.
- **`postcss.config.mjs`의 플러그인 경로는 절대 경로**(`process.cwd()` 기준)다. Turbopack은 상대 경로를 못 찾고(앱 CSS 전체가 깨진다), `.mjs` 플러그인은 webpack 빌드에서 `next/font` 오류를 냈다. 그래서 `.cjs`다.
- 라이트/다크는 앱의 `next-themes`를 따른다(`SurveyTheme`).

## 검증 (2026-11-13)

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 오류 없음 |
| `npx vitest run` | 1661 통과(건너뜀 3 = 정답 대조, 환경변수 있을 때만) |
| `npx eslint src` | 오류 없음 |
| `next build` | 통과. 홈 First Load JS **299 kB**(계획 기준 297~298 kB, 메뉴 항목 추가로 1~2 kB 증가). Astryx는 지연 로딩 청크 2개에만 있고 홈 HTML의 CSS 2개에는 없다 |
| 화면(개발 서버) | 실사서 11건 업로드, 펼치기, 환경설정 창을 라이트·다크 모두 캡처. 가로 스크롤 없음, 콘솔 오류 없음 |
| unslop 점검 | 장식(그라디언트·이모지·글로) 없음. 한 문장 설명의 끝 마침표를 지움 |

### 정답 대조 (수동, 실제 실사서 vs `공정_일정관리 (1).xlsb` `세부_26년`)

| 칸 | 일치 |
|---|---|
| 방식 | 10/10 |
| 모국(&기지국) · 집중국 | 11/11 · 11/11 |
| 철탑 형태 · 장비위치 | 11/11 · 11/11 |
| 철탑 규격(인빌딩 제외) | 10/10 |
| 공중선 형상(인빌딩 제외) | 7/10 — 수완포레 3건이 `1S`·`3S`로 입력되어 있어 다른 것이 정상(결정 4) |
| 확실 16칸(수완포레·아트박스) | 전부 일치 |

## 계획과 달라진 점(Ruling)

- `use-shell-nav.ts`를 한 줄 고쳤다(`segment !== "survey"`). `NavSubKey`에 `survey`가 들어가 `tsc` 오류가 났고, 동작은 같다.
- `deriveStations`는 모국명이 비면 집중국도 `""`다(없는 값을 `비SCAN`으로 지어내지 않는다). 테스트로 고정했다.
- `치환 추가` 버튼은 원본이 곧 치환 전 값인 칸(`copy` 변환)에만 보인다.
- 정답 대조 테스트는 `describe` 본문이 건너뛸 때도 실행돼 수집 단계에서 깨져서 `beforeAll`로 지연 읽기로 고쳤다.
- 계획의 "소스는 CRLF"와 달리 이 작업 폴더의 파일은 LF였다. 원래 줄바꿈을 그대로 지켰다.

## 결과 엑셀 양식 (2026-11-13 추가)

결과 엑셀 `세부_입력값` 시트는 첨부 양식(`현장실사서.xlsx`의 `세부_27년`)과 **같은 모양**으로 나온다. 1~6행은 머리글 블록(3행 개수 합계 수식, 4행 그룹 이름, 5·6행 머리글), 데이터는 7행부터, 데이터 아래에 검정 끝 막대 행이 있다.

- **서식**: 초록 머리글, 테두리, 회색 열, 6행 필터, 왼쪽 8열·위쪽 6행 고정, 눈금선 끔, 열 너비·행 높이, 조건부 서식(H열), 입력 안내(BA5·AQ5)를 모두 옮겼다. `exceljs`(이미 쓰는 의존성)로 쓰고 내려받을 때 처음 불러온다.
- **양식 파일을 저장소에 넣지 않았다.** 양식 엑셀에는 이름 정의 822개, 로컬 경로를 가리키는 외부 링크, 작성자 이름이 들어 있어서 서식만 뽑아 `constants/detail-template.ts`(테마 색은 실제 RGB)로 옮겼다. 양식이 바뀌면 같은 방법으로 다시 만든다.
- **32건을 넘으면** 데이터 행을 늘리고 막대·필터 범위·3행 수식 범위·조건부 서식이 따라간다.
- **확인**: 실제 실사서 11건으로 만든 결과를 양식과 비교해 39행 × 80열 서식 차이 0건, 필터·고정 칸·눈금선·열 너비·5행 높이가 같았다.
- **한계**: 양식 1~2행 왼쪽 위에 있는 도형(그림)은 옮기지 않았다.

## 알려진 한계·2차

- 설정 가져오기·내보내기, 읽는 위치(`sources`) 편집, `세부_27년` 전용 처리(2차).
- 결과 표에서 고른 줄은 "접기" 버튼 글자로만 구분된다(Astryx `TableRow`에 선택 상태가 없다). 채운 칸·경고 열의 숫자는 정렬되지 않는다.
- 관리자 권한 동작은 마이그레이션 적용 전이라 확인하지 못했다(위 2번).
