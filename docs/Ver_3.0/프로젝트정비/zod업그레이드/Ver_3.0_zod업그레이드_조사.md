# zod 취약점·v4 이전 조사

조사일 2026-11-15. 설치 3.25.76(`node_modules/zod/package.json`), TypeScript 5.9.3.

- 결론: GHSA-mrhx-c7xc-m3w5는 `<4.6.6` 전체라 3.x도 범위에 든다. 권고 패치 버전은 4.6.6이고 npm은 4.6.7(latest)을 제시한다.
- 3.x용 수정은 `v3.25.x` 브랜치에 병합됐으나(PR #6699) **npm에는 3.25.76 다음 버전이 없다**(미배포).
- 이 프로젝트에서 실제 위험은 낮다(추정). 본문 32 KiB 상한이 있는 라우트 1곳과, 관리자만 쓰는 DB 설정값 1곳뿐이다.
- v4로 바꾸면 코드 변경이 필요한 곳은 `z.record(sourceRef)` 1줄(필수)과 `.finite()` 등 비권장 호출이다. 나머지는 그대로 동작할 가능성이 높다(추정).
- 단계적 이전(`zod/v4` 부분 import)은 3.25.x에서 공식 지원된다.

## 1. 취약점

| 항목 | 내용 | 출처 |
| --- | --- | --- |
| 식별자 | GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404, CWE-770 | `gh api advisories/GHSA-mrhx-c7xc-m3w5` |
| 영향 범위 | `vulnerable_version_range: "< 4.6.6"`, `first_patched_version: "4.6.6"` (3.x 포함) | 같은 명령 출력 |
| 심각도 | CVSS 3.1 7.5 High `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`, CVSS 4.0 8.2 | 같은 명령 출력 |
| npm audit | `range "<4.6.6"`, `fixAvailable: zod 4.6.7, isSemVerMajor: true` | `npm audit --json` |
| 게시일 | 2026-10-01, 갱신 2026-10-23 | `gh api` 출력 |

- 설명(원문 요지): 길이 제한이 없는 배열 스키마에 큰 배열을 보내면 `$ZodArray`의 `handleArrayResult`가 실패한 원소마다 이슈를 전부 쌓아 메모리가 고갈된다. 조건은 (a) 배열 스키마 (b) 원소 다수가 검증 실패. 출처: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
- 제목은 "constrained collections"인데 설명은 "without a length constraint"라 서로 어긋난다. 수정 커밋 메시지가 사정을 밝힌다: `.max()`·`.length()`·`.size()`가 **원소를 전부 순회한 뒤** 실행돼, 상한이 있어도 이슈가 원소 수만큼 만들어졌다. 예: `z.array(z.string().uuid()).max(100)`에 숫자 100만 개를 넣으면 이슈 1,000,001개, 약 450 ms (PR #6652 본문, https://github.com/colinhacks/zod/pull/6652). 즉 `.max()`를 걸어도 입력 크기만큼은 소모된다.
- 원 제보 #1872는 **3.20.2**에서 재현했다. 100만 원소 배열은 safeParse 3초, 1,000만 개면 Node가 OOM으로 종료(https://github.com/colinhacks/zod/issues/1872). v3도 같은 동작이다.
- 공식 완화책: 어드바이저리에 **워크어라운드 기재 없음**. 길이 상한을 거는 것은 이슈 #1872가 언급한 일반 대응(요청 본문 상한, `.length`)이다.
- 수정(v4): 커밋 a0ebf97 / PR #6652 "check array, set and map size bounds before parsing elements". 상한 검사를 순회 앞으로 옮겼다. 4.6.6(2026-10-11) 포함, 4.6.7(2026-10-12)은 `4.6.7` 버전 커밋만 있는 후속 릴리스(`gh api repos/colinhacks/zod/releases/tags/v4.6.6|v4.6.7`).
- PR #6475 `abortEarly` 옵션은 병합되지 않고 닫혔다(`merged:false`). 그래서 옵션으로 끄는 길은 없다.
- 3.x 패치: PR #6699 "fix(3.25): backport the collection-size, emoji and intersection DoS fixes"가 `v3.25.x` 브랜치에 병합(`merged:true`). 본문에 "There's no version bump here"라고 적혀 있다. `npm view zod versions --json`의 3.x 마지막 정식은 3.25.76, `gh api .../git/matching-refs/tags/v3.25.7` 태그도 v3.25.76까지다. **조사 시점에 배포된 3.x 패치 버전은 없다.**
- 부수: 4.6.6 릴리스 노트에 "9월 21일 탈취된 자격 증명으로 악성 커밋 6개가 main에 올라갔다가 되돌려졌고 npm에는 배포된 적 없다"는 공지가 있다(https://github.com/colinhacks/zod/releases/tag/v4.6.6). 4.6.x를 받을 때 `npm ci`의 무결성 해시 고정으로 충분한지는 따로 판단이 필요하다.

## 2. v4 이전에서 이 프로젝트가 영향받는 것

두 파일이 쓰는 API: `z.object`, `z.string().min().max()`, `z.number().finite().min().max()`, `z.number().int().optional()`, `z.boolean`, `z.array().min().max()`, `z.enum`, `z.literal`, `z.record(sourceRef)`, `z.discriminatedUnion`, `z.infer`, `.optional()`, `safeParse`, `error.issues`(`path`, `message`).

변경 출처는 https://zod.dev/v4/changelog 이다(해당 절 이름 인용). "확인"은 설치된 3.25.76의 `node_modules/zod/v4/**/*.d.ts`로 본 것이다.

| API | v4 변경 | 이 프로젝트 사용처 | 영향 |
| --- | --- | --- | --- |
| `z.record` | "drops single argument usage": 값 스키마만 받는 형태 제거, 키·값 2개 필수(확인: `record(keyType, valueType, params?)`) | settings-schema.ts:21 `z.record(sourceRef)` | **수정 필수** → `z.record(z.string(), sourceRef)` |
| `z.number().finite()` | v4에서 무한값 기본 거부라 no-op, `@deprecated`(확인) | route.ts:25,26 | 동작 동일, 호출은 지워도 됨 |
| `z.number().int()` | "accepts safe integers only" | settings-schema.ts:12,15 | 안전 범위 밖 정수만 거부, 설정 값엔 무관(추정) |
| `message`/`error` 커스텀 | `message` 비권장, `error` 사용 | 두 파일 모두 커스텀 메시지 없음 | 없음 |
| `ZodError.issues` | `.errors` 제거, `.issues` 유지. 이슈 형식 정리 | settings-schema.ts:74 `.issues`만 사용 | 없음 |
| `issue.path` | 타입이 `PropertyKey[]`(확인: errors.d.ts `path: PropertyKey[]`), symbol 가능 | settings-schema.ts:74 `i.path.join(".")` | 이 스키마엔 symbol 키가 없어 실제 오류 없음(추정). 타입은 통과 |
| `issue.message` | 기본 영문 문구가 v4에서 바뀜(changelog의 "updates issue formats" 계열, 문구 목록은 미확인) | settings-schema.ts:74 → 사용자에게 표시 | 화면 문구가 달라질 수 있음. 테스트가 문구를 고정했는지 확인 필요 |
| `z.enum`, `z.literal` | `nativeEnum` 비권장, literal의 symbol 제외 | route.ts:34, settings-schema.ts:14,25,26,31 | 없음(문자열·숫자 1만 사용) |
| `z.discriminatedUnion` | changelog에 이 API 절 없음 | settings-schema.ts:24 | 변경 없음으로 보이나 타입 단위 시험 필요(추정) |
| `z.infer` | `.nonempty()`·`unknown` 선택성 변경 | route.ts:38 | 해당 API 미사용, 영향 없음 |
| `.optional()` / 기본값 | `.default()` 의미 변경, optional 안의 default 적용 | `.default()` 사용 없음 | 없음 |
| `z.object` 기본 | strip 기본 유지. `.strict()`·`.passthrough()`·`.strip()` 비권장 | 사용 없음 | 없음 |
| `z.object(Object.fromEntries(...))` | changelog에 언급 없음 | settings-schema.ts:32 | 동적 shape의 타입 추론이 달라질 수 있음, 빌드로 확인 필요(추정) |
| `safeParse` 결과 | changelog에 변경 기재 없음 | route.ts:119, settings-schema.ts:70 | 없음 |

- `zod/v4` 노출: 설치 3.25.76의 `package.json` exports에 `"./v3"`, `"./v4"`가 있다(`grep` 출력). 공식 문서는 `zod@^3.25.0`부터 서브패스를 지원하고 "No code changes were made between the latest 3.25.x release and 4.0.0"이라 밝힌다(https://zod.dev/v4/versioning). 4로 올리면 루트가 v4가 되고 v3는 `zod/v3`로 남는다.
- 요구 환경: 문서는 "TypeScript v5.5 and later", `"strict": true`를 요구하고 Node 최소 버전·ES 타깃은 명시하지 않는다(https://zod.dev/). 이 프로젝트는 TypeScript 5.9.3, `strict: true`, `target: ES2017`, `moduleResolution: bundler`, Node `>=22`(package.json engines)로 충족한다. ES2017 타깃과의 호환은 문서에 기재가 없어 확인하지 못했다.

## 3. 이 프로젝트의 노출 정도

- kakao-route (`src/app/api/kakao-route/route.ts`)
  - 확인(코드): `stops: z.array(pointSchema).min(1).max(31)`(32행)가 공격 입력이 닿는 배열이다. 다만 앞에서 `guardProxyRequest`(동일 출처·IP 레이트리밋·로그인 Bearer 검증, 104행)를 통과해야 하고, `MAX_BODY_BYTES = 32 * 1024`(20행)를 `Buffer.byteLength`로 검사한 뒤(108행) 파싱한다.
  - 계산(추정): 32 KiB로 만들 수 있는 최소 원소는 `0,`(2 B)여서 약 1.6만 원소, 원소마다 `invalid_type` 이슈 1개면 이슈 약 1.6만 개다. `{}`(3 B)면 약 1만 원소에 각 4이슈(id·name·lat·lng 누락)라 약 4만 개다. 취약점 예시의 100만 건·450 ms보다 두 자릿수 작다. 메모리 고갈과는 거리가 멀다(추정).
  - 즉 상한이 걸려 있어 취약점 본체인 "대형 배열"은 파싱 전에 막힌다. 로그인 사용자만 도달한다는 점도 위험을 낮춘다(`guardProxyRequest`의 검증 범위는 `proxy-guard.ts` 앞부분만 읽었다).
- settings-schema (`src/features/site-survey/lib/settings-schema.ts`)
  - 확인(코드): `parseOverrides`는 `api.ts:44`에서 Supabase `survey_settings.settings` 값을 읽어 검증한다. 요청 본문이 아니라 DB 행이고, 실행 위치는 브라우저 클라이언트다(`SupabaseBrowserClient`). 배열(`aliases`, `modeRules`, `knownModes`, `stripTags` 등)에는 `.max`가 없다.
  - 쓰기 권한: `api.ts` 머리 주석은 수정을 관리자만 허용하는 DB 정책(`public.is_app_admin()`)을 말한다. 정책 SQL은 읽지 않아 주석 수준의 확인이다.
  - 추정: 공격자가 이 행에 거대한 배열을 넣으려면 관리자 권한이 필요하고, 터지는 쪽도 서버가 아니라 그 관리자 브라우저 탭이다. 서버 가용성 영향은 없다.
- 종합(추정): 서버 측 DoS 노출은 kakao-route 한 곳이고 본문 상한·인증으로 실질 영향이 작다. `npm audit`의 High는 범위 기준 경고이며 이 코드 경로의 실제 위험도와는 다르다. 그래도 경고를 없애려면 4.6.7 업그레이드가 유일한 배포된 해법이다.

## 4. 확인하지 못한 것

- `v3.25.x` 브랜치의 수정이 npm으로 언제 배포되는지: 근거 없음. 배포되면 3.25.77 같은 버전이 `npm view zod versions`에 나타날 것이다(추정).
- changelog에서 v4 기본 오류 문구 변경의 구체 목록, `z.discriminatedUnion`의 미기재 변경, ES2017 타깃 호환: 공식 페이지에서 찾지 못함.
- 프로젝트 테스트가 zod 오류 문구에 의존하는지, 4.6.7로 올려 `npx tsc --noEmit`·`npm test`가 통과하는지: 이번 조사에서 실행하지 않았다(파일 수정 금지 조건).
- `survey_settings`의 실제 RLS 정책과 `guardProxyRequest`의 토큰 검증 세부: 코드·SQL 전체를 읽지 않았다.
- WebFetch 결과는 요약 모델을 거친 것이라 changelog 문구는 절 이름 외에는 의역이다. 어드바이저리·PR·커밋·릴리스는 `gh api`로 원문 확인.
