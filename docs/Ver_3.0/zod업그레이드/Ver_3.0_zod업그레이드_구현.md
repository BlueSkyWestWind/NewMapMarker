# zod 업그레이드 (구현)

구현일 2026-11-15 · 설계: [Ver_3.0_zod업그레이드_설계.md](Ver_3.0_zod업그레이드_설계.md) · 계획: [Ver_3.0_zod업그레이드_구현계획.md](Ver_3.0_zod업그레이드_구현계획.md) · 조사: [Ver_3.0_zod업그레이드_조사.md](Ver_3.0_zod업그레이드_조사.md)

`zod`를 3.25.76에서 **4.6.7**로 올려 `npm audit`의 zod 높음 경고(GHSA-mrhx-c7xc-m3w5)를 없앴다. 소스 변경은 3줄이다. 구현은 agy가 하고 Claude가 diff를 검토했다.

## 직접 하실 일

1. **현장실사서 설정 화면**에서 잘못된 값(예: 숫자가 들어갈 칸에 글자)을 저장해 보고, 오류 안내가 자연스럽게 나오는지 본다. zod가 바뀌어 기본 오류 문구가 달라질 수 있는데, 자동 테스트는 문구를 고정하지 않아서(문구가 바뀌어도 통과) 화면으로만 확인된다.
2. **경로탐색**을 한 번 실행해 본다(출발지 + 방문 지점 몇 개).
3. 이상이 없으면 "커밋"이라고 말씀해 주세요.

## 한 일

| 대상 | 내용 |
|---|---|
| `package.json`·`package-lock.json` | `"zod": "^3"` → `"zod": "^4.6.7"`. 락파일 변경은 zod 부분뿐(+4/−13)이고 다른 패키지는 바뀌지 않았다. `npm ls zod`는 4.6.7 한 벌이다 |
| `site-survey/lib/settings-schema.ts:21` | `z.record(sourceRef)` → `z.record(z.string(), sourceRef)` (v4에서 값 스키마만 받는 형태가 제거됨, 컴파일러가 이 한 곳만 지적했다) |
| `app/api/kakao-route/route.ts:25,26` | `lat`·`lng`의 `.finite()` 제거(v4에서는 무한값을 기본 거부해 동작이 같다) |
| 테스트 | 올리기 **전에** 특성화 테스트를 보강했고(현재 버전에서 통과), 올린 뒤 기대값 변경 없이 통과했다 |

## 공급망 확인

조사에서 4.6.6 릴리스 노트에 탈취 자격 증명 사건(악성 커밋이 `main`에 올라갔다가 되돌려졌고 npm에는 배포된 적 없음)이 있어서, 올리기 전에 확인했다.
- `npm view zod@4.6.7 dist.integrity`: `sha512-g8W2D2kU6a8u…` (락파일에 기록됨), 출처 `https://registry.npmjs.org/zod/-/zod-4.6.7.tgz`.
- `npm audit signatures`: 986개 패키지의 레지스트리 서명 검증 통과, 272개 패키지의 증명(attestation) 검증 통과.

## 검증

| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit` | 오류 0건 (올린 직후 1곳 오류 → 위 수정으로 해소) |
| `npx eslint . --max-warnings=0` | 오류 0건 |
| `npm test` | 154개 파일 통과, 1개 스킵 / 1,800개 통과, 3개 스킵 |
| `npm audit --omit=dev` | **zod 항목 사라짐.** 11건(높음 6) → 10건(높음 5) |
| 임시 distDir 빌드 | 성공. 홈 283 kB(이전 282 kB), `/gpsmap` 207 kB |

- 추가한 특성화 테스트: `settings-schema`의 `record` 필드(정상 객체 통과 / 값 타입이 틀리면 경로 `fields.sharer.sources.primary.section`과 함께 거부, 문구는 고정하지 않음), `kakao-route`(`stops` 비어 있음, `lat`이 문자열 → 400. 상한 초과 32개 케이스는 기존 테스트에 있었다).
- 홈 +1 kB: 이 변경 때문인지 분해하지 않았다. 앞선 회귀수정이 업로드 훅에서 `date-utils`를 정적으로 import하게 되어 홈 청크에 들어온 것이 더 유력하다(zod는 현장실사서 지연 로드 화면의 코드다). 기준(295 kB) 안이다.

## 한계

- 남은 취약점 10건은 이번 범위가 아니다: `@opennextjs/*`·`glob`·`minimatch`(빌드 도구), `postcss`(Next 내장), `exceljs`→`uuid`, `esbuild`(개발 서버, 낮음). `npm audit`의 수정 제안은 옛 버전으로 내리라는 잘못된 안이라 따르지 않는다. 별도 점검 대상이다.
- `kakao-route`의 "`lat`이 `Infinity`" 테스트는 요청 본문을 `JSON.stringify`하므로 `Infinity`가 `null`로 바뀌어 전달된다. 결과는 같은 400이지만 `Infinity` 자체를 검증하지는 않는다(zod 자체의 무한값 거부는 조사에서 문서로 확인한 사항이다).
- ES2017 타깃과의 호환은 공식 문서에 기재가 없었으나, 타입 검사·테스트·빌드가 모두 통과했다.
