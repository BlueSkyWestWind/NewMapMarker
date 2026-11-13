# 스타일 정리 (구현)

구현일 2026-11-13 · 설계: [Ver_3.0_스타일정리_설계.md](Ver_3.0_스타일정리_설계.md) · 계획: [Ver_3.0_스타일정리_구현계획.md](Ver_3.0_스타일정리_구현계획.md)

unslop 점검에서 나온 슬롭 8가지를 shadcn/Tailwind 안에서 정리했다. 소스 77파일을 고쳤다(+319 −313줄). **커밋하지 않았다.**

## 직접 하실 일

눈으로만 아는 것은 로그인 뒤 화면이라 제가 확인하지 못했다. **로그인해서 아래를 확인해 주세요.** 문제가 있는 화면 이름을 알려 주시면 그 화면만 고친다.

1. **표·패널 폭(글자 10→11px)**: 마커 상세, 마커 편집(사양 목록), ERP 검토 패널, 지도 영역 안내, **위성 지도 날씨 말풍선**, 대시보드, 위치/좌표 변환기, CCTV, 경로, 바코드, 그룹 표, 계정 표를 데스크톱과 모바일 폭에서 본다. 줄바꿈·잘림·가로 스크롤이 없어야 한다. 가장 위험한 항목이다.
2. **지도 오른쪽 플로팅 컨트롤 4개**: 켜졌을 때와 꺼졌을 때 구분되는가(글로를 걷어내고 `bg-slate-800`으로 표면 한 단계를 더했다).
3. **라이트 모드 파란 버튼**: 글자가 읽히는가(브랜드 `--primary`, 흰 글자 대비 6.28). 다크에서는 지금보다 약간 밝아진다.
4. **태풍 정보 창의 안전 수칙 3줄**: 금지(`OctagonX`)·주의(`AlertTriangle`)·절차(`ClipboardList`) 아이콘으로 구분되는가.
5. **제목 굵기**: 로그인·사이드바·모달 제목이 너무 가벼워 보이지 않는가(`font-bold`→`font-semibold`).
6. **작은 칩·태그 모서리**: 4px→8px로 커졌다. 어색한 곳은 알려 달라.
7. **지도 범례의 색 점**: 위성 지도 안내(`🟨`→노란 점), 브이월드 지적도(`🟩`→초록 점).
8. 커밋하려면 "커밋"이라고 말해 달라. 계획의 체크포인트(Task 2·7·10 뒤)는 건너뛰고 끝까지 진행했으므로 한 번에 커밋하거나 나눠서 커밋할 수 있다.

## 한 일

| # | 항목 | 변경 |
|---|---|---|
| 1 | 글로 | 기본 버튼을 `bg-primary text-primary-foreground hover:bg-primary/90`으로(그라디언트·`hover:shadow-glow` 제거). `dialog`·`input`·`markers-list-panel`·`map-floating-controls`(4)에서 `shadow-glow`를 지움. 플로팅 컨트롤 활성은 `bg-slate-800`. `tailwind.config.ts`의 `glow`·`glow-sm`과 `globals.css` 주석 삭제 |
| 2 | 그라디언트 | 대시보드 위성 버튼 → `bg-sky-600/15`, 로드뷰 제목 → `text-slate-100 font-semibold` |
| 3 | 이모지 | 그림 이모지 34곳 정리: 의미가 있으면 lucide 아이콘(`TriangleAlert`·`OctagonX`·`ClipboardList`·`CalendarDays`·`Wind`), 라벨이 뜻을 말하면 삭제, 색 범례 `🟨 🟩`는 작은 색 점. `.ts`의 지도 말풍선 `📍` 제목도 삭제 |
| 4 | `transition-all` | 5곳 → `transition-colors`·`transition-[transform,opacity]`·`after:transition-transform`, 진행 막대는 전환 제거 |
| 5 | 대문자·자간 | 9곳의 `uppercase tracking-wider`를 지우고 `font-medium`, 단축키 `tracking-widest` 삭제 |
| 6 | 굵기 | `font-bold`·`font-extrabold` 29줄(19파일) → `font-semibold` |
| 7 | 작은 글자 | `text-[9px]`·`text-[10px]` 149곳(36파일, `.ts` 말풍선 11곳 포함) → `text-[11px]` |
| 8 | 모서리 | 단독 `rounded` 73곳 → `rounded-sm`(8px), `rounded-xl` 24곳 → `rounded-lg`(값이 같아 모양 그대로) |

## 스타일 가드

`src/lib/style-guard.test.ts`(`npm test`에 포함)가 `src/**/*.{ts,tsx}`에서 금지 패턴을 막는다.

- **영구 규칙 5개**: `glow`·`gradient`·`emoji`·`transitionAll`·`tracking`. `CLEAN_SCOPES = ["src"]`.
- **임시 규칙 3개**: `bold`·`tinyText`·`radius`. 정리가 끝나 `CLEAN_SCOPES = []`로 비웠다(코드와 정규식은 남김. 다시 막으려면 `["src"]`).
- **`ALLOW` 2개**: `schedule-legend.tsx:bold`(범례가 굵은 글자 자체를 보여 준다), `worksite-weather/types/weather.ts:emoji`(날씨 판정 신호 `VERDICT_ICON`).
- `AGENTS.md` 코드베이스 메모에 한 줄을 더했다.

## 검증 (2026-11-13)

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 오류 없음 |
| `npx vitest run` | 1687 통과(건너뜀 3 = 현장실사서 정답 대조) |
| `npx eslint src` | 오류 없음 |
| `next build` | 통과. 홈 First Load JS **298 kB**(기준 299 이하) |
| 변경 검토 | 같은 클래스가 한 줄에 중복된 곳 0건, `rounded-sm`과 다른 모서리 클래스가 충돌한 곳 0건 |
| 로그인 화면 전후(라이트·다크) | 아래 참고 |

### 로그인 화면의 달라진 점 (회귀가 아니라 기존 버그가 드러난 것)

로그인 버튼은 입력이 비면 `bg-slate-800 text-slate-400`(회색)이 되도록 짜여 있었다. 그런데 기본 버튼 변형의 그라디언트가 `background-image`라서 `bg-slate-800`(배경색)을 덮어, **파란 바탕에 회색 글자**로 보였다. 그라디언트를 걷으니 의도한 회색 비활성 상태가 나온다(다크: 짙은 회색, 라이트: 옅은 청회색). 나머지 로그인 화면은 같다.

## 계획과 달라진 점(Ruling)

- **계획서의 Task별 사용자 확인과 커밋 체크포인트는 수행하지 않았다.** 로그인 뒤 화면을 볼 수 없어서다. 위 "직접 하실 일"로 모았다.
- Task 7의 `font-bold` 변경이 계획의 파일 목록과 달리 19파일 29줄로 실행됐다(`roadview-modal`은 Task 2에서 이미 처리, `schedule-legend`는 예외).
- 이모지는 계획의 "약 18곳(Task 4)"보다 `.tsx` 17곳 + `.ts` 1곳이었다. 가드의 실제 실패 목록을 기준으로 했다.
- 글자 상향·모서리·굵기는 **같은 스크립트로 일괄 치환**했다. 줄 단위로 주석 줄은 건너뛰었다.

## 알려진 한계

- 가드는 클래스 글자만 잡는다. `cn()`으로 조합되는 동적 클래스나 `"text-" + size` 같은 조각은 못 잡는다.
- 날씨 판정 이모지(`VERDICT_ICON`)는 이번에 정리하지 않았다(작은 상태 점 컴포넌트로의 교체는 별도 작업).
- 임의 px 값 455곳, 한글 서체, 상태색, 모달 `shadow-2xl`은 범위 밖이다.
- 로그인 뒤 화면은 눈으로 확인하지 못했다.
