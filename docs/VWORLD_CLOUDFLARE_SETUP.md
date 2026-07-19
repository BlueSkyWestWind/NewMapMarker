# VWorld 필지 경계 — 설정 가이드 (브라우저 직접 호출 방식)

장소 검색 시 지도에 **필지 경계(분홍 폴리곤)** 를 그리는 기능은 **VWorld(국토교통부 공간정보 오픈플랫폼)** 연속지적도 API를 사용합니다.

> ⚠️ **왜 브라우저에서 직접 호출하나?**
> VWorld는 **Cloudflare 등 해외 서버 egress 요청을 502/520으로 거부**합니다(서버 프록시 불가, 실측 확인).
> 그래서 **방문자의 브라우저(한국 IP)에서 JSONP로 VWorld를 직접 호출**합니다. VWorld REST API는 CORS 미지원이라 JSONP(script 주입)만 가능합니다.
> 구현: `src/features/map-marker/lib/parcel-boundary.ts` (서버 라우트 `/api/parcel-boundary`는 제거됨).

---

## 동작 개요

1. 브라우저가 VWorld 지오코더로 주소 → 좌표 (JSONP)
2. 브라우저가 VWorld 연속지적도로 좌표 → 필지 폴리곤 (JSONP)
3. 카카오 지도에 폴리곤을 그림

키는 브라우저에 노출되지만 **VWorld의 도메인/Referer 제한**으로 보호됩니다 → **등록된 도메인에서 온 요청만** 키가 동작합니다.

---

## 설정 (2가지)

### ① 인증키 — 이미 커밋됨 (추가 작업 없음)

`NEXT_PUBLIC_VWORLD_API_KEY`가 **`wrangler.jsonc`의 `vars`** 와 `.env.local`에 들어 있습니다.
Private 레포이고 도메인 제한 키라 커밋해도 됩니다. Git 빌드마다 자동 적용되어 **삭제되지 않습니다.**

> 서버 프록시 시절의 `VWORLD_API_KEY`(Secret)·`VWORLD_DOMAIN`은 **더 이상 사용하지 않습니다.** Cloudflare 대시보드에 남아 있으면 삭제해도 됩니다.

### ② VWorld 콘솔 — 서비스 도메인 등록 (⚠️ 필수)

브라우저 JSONP 요청은 **Referer(현재 페이지 도메인)** 로 검증됩니다. VWorld 콘솔에 **아래 도메인이 모두 등록**돼 있어야 합니다.

[vworld.kr](https://www.vworld.kr) → **마이페이지 → 오픈API → 인증키 관리** → 해당 키 수정 → 서비스 URL/도메인:

| 도메인 | 용도 |
| --- | --- |
| `localhost` | 로컬 개발 (이미 등록됨) |
| `newmarker.celyoon.workers.dev` | **배포 — 반드시 추가** |
| (커스텀 도메인 연결 시 그 도메인) | 배포 |

미등록 도메인에서 호출하면 `INCORRECT_KEY(인증키 정보가 올바르지 않습니다)`가 납니다.

---

## 확인

- **로컬**: `npm run dev` (env 변경 후 **재시작 필수**) → localhost:3000 → 장소 검색 → 필지 경계 표시.
- **배포**: 도메인 등록 후 `git push`(자동 배포) → 배포 URL에서 검색.

### 트러블슈팅

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `INCORRECT_KEY` | VWorld에 해당 도메인 미등록 | ②에 배포 도메인 추가 |
| `VWorld 인증키가 설정되지 않았습니다` | `NEXT_PUBLIC_VWORLD_API_KEY` 미주입 | dev 서버 재시작 / 재배포 |
| `주소를 찾을 수 없습니다` | 지오코딩 실패 | 도로명·지번 주소로 재시도 |
| 응답 시간 초과 | 네트워크/차단 | 잠시 후 재시도 |

> 참고: 서버(Cloudflare)에서 직접 호출하면 `502/520`이 납니다(VWorld 해외 IP 차단). 그래서 브라우저 방식으로 전환했습니다.
