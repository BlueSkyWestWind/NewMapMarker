# VWorld 인증키 — Cloudflare 등록 양식

장소 검색(필지 경계) 기능은 서버 라우트 `/api/parcel-boundary`가 **VWorld(국토교통부 공간정보 오픈플랫폼)** API를 호출해 동작합니다.
로컬(`localhost`)은 `.env.local`로 이미 동작하며, **배포(Cloudflare Workers)에서 쓰려면 아래 2곳에 등록**해야 합니다.

> ⚠️ 핵심 규칙: VWorld **데이터 API는 `domain` 파라미터가 필수**이고, 그 값이 **인증키에 등록된 도메인과 정확히 일치**해야 합니다.
> 불일치 시 `INCORRECT_KEY(인증키 정보가 올바르지 않습니다)` 오류가 납니다.

---

## 0. 먼저 확인할 값 (빈칸 채우기)

| 항목 | 값 | 확인 방법 |
| --- | --- | --- |
| VWorld 인증키 | `__________________________________` | 로컬 `.env.local`의 `VWORLD_API_KEY` (또는 VWorld 마이페이지) |
| 배포 도메인(hostname) | `__________________________________` | 예: `newmarker.<계정>.workers.dev` 또는 연결한 커스텀 도메인 |

- **배포 도메인 찾기**: Cloudflare 대시보드 → Workers & Pages → **newmarker** → 상단에 표시되는 URL, 또는 `npm run deploy` 실행 후 콘솔에 출력되는 배포 URL.
- 도메인은 **scheme(`https://`)·경로·포트 없이 hostname만** 적습니다. (`newmarker.xxx.workers.dev`)

---

## STEP 1 — VWorld 콘솔: 인증키에 배포 도메인 등록

[vworld.kr](https://www.vworld.kr) 로그인 → **마이페이지 → 오픈API → 인증키 관리** → 해당 키 **수정**.

| 입력 항목 | 입력값 |
| --- | --- |
| 서비스 URL / 도메인 | `localhost` **(기존 유지)** |
| 서비스 URL / 도메인 **추가** | `__________________________________` (위 0번의 배포 도메인) |

- 여러 도메인 등록이 가능하면 `localhost`(개발)와 배포 도메인을 **모두** 남겨 둡니다.
- 한 개만 가능하면 배포용으로 교체하고, 로컬 테스트 시 다시 `localhost`로 바꿉니다.
- 저장 후 반영까지 몇 분 걸릴 수 있습니다.

---

## STEP 2 — Cloudflare: 환경변수 등록

Cloudflare 대시보드 → Workers & Pages → **newmarker** → **Settings → Variables and Secrets** → **Add**.

| Variable name | Value | Type | 비고 |
| --- | --- | --- | --- |
| `VWORLD_API_KEY` | *(발급받은 VWorld 인증키)* | **Secret**(암호화) | 서버 전용 키 → Secret 권장 |
| `VWORLD_DOMAIN` | *(위 0번의 배포 도메인 hostname)* | Text(Plaintext) | STEP 1에서 등록한 도메인과 **동일해야 함** |

- 환경: **Production**(운영). 미리보기도 쓰면 Preview에도 동일하게 추가.
- `VWORLD_API_KEY`는 **커밋되는 `wrangler.jsonc`의 `vars`에 넣지 마세요.** (공개 키인 Kakao/Supabase와 달리 서버 비밀값)

### 대안 — wrangler CLI

```bash
# 시크릿(암호화) 등록 — 실행 후 프롬프트에 키 붙여넣기
npx wrangler secret put VWORLD_API_KEY

# 도메인은 일반 변수: 대시보드에서 넣거나, 커밋 원하면 wrangler.jsonc "vars"에 추가
#   "VWORLD_DOMAIN": "newmarker.xxx.workers.dev"
```

---

## STEP 3 — 재배포

변수만 추가했어도 **재배포해야 런타임에 반영**됩니다.

```bash
npm run deploy
```

또는 대시보드에서 **Deployments → Retry / Redeploy**.

---

## STEP 4 — 확인

1. 배포 URL에서 브라우저로 접속 → 사이드바 **장소 검색**에 주소 입력 → 지도에 **분홍 필지 경계**가 그려지면 성공.
2. API 직접 확인(선택):

```bash
curl "https://<배포도메인>/api/parcel-boundary?address=광주광역시 광산구 풍영로 63"
# 정상: {"center":{...},"label":"...","parcels":[{...}]}
```

---

## 트러블슈팅

| 증상(응답) | 원인 | 해결 |
| --- | --- | --- |
| `INCORRECT_KEY / 인증키 정보가 올바르지 않습니다` | `VWORLD_DOMAIN`이 VWorld 등록 도메인과 불일치, 또는 비어 있음 | STEP 1·2의 도메인을 **동일**하게 맞추고 재배포 |
| `VWORLD_API_KEY가 설정되지 않았습니다` | Cloudflare에 변수 미등록 / 재배포 안 함 | STEP 2 후 재배포 |
| `주소를 찾을 수 없습니다` | 지오코딩 실패(오타·비표준 주소) | 도로명 또는 지번 주소로 재시도 |
| 로컬은 되는데 배포만 실패 | 배포 도메인이 VWorld에 미등록 | STEP 1에 배포 도메인 추가 |

> 참고: 서버가 VWorld에 **`Referer` 헤더를 보내면** VWorld가 `domain` 대신 Referer로 검증하다 `INCORRECT_KEY`가 납니다. 현재 프록시(`src/app/api/parcel-boundary/route.ts`)는 Referer를 보내지 않고 `domain` 파라미터만 사용하도록 되어 있습니다.

---

## 체크리스트

- [ ] VWorld 인증키 확보
- [ ] 배포 도메인(hostname) 확인
- [ ] STEP 1 — VWorld 콘솔에 배포 도메인 등록
- [ ] STEP 2 — Cloudflare에 `VWORLD_API_KEY`(Secret) + `VWORLD_DOMAIN`(Text) 등록
- [ ] STEP 3 — 재배포
- [ ] STEP 4 — 배포 URL에서 검색 → 필지 경계 표시 확인
