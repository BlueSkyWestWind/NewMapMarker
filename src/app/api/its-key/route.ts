import { NextRequest, NextResponse } from "next/server";
import { guardProxyRequest } from "@/lib/api/proxy-guard";

/**
 * ITS 인증키를 브라우저에 전달한다.
 *
 * **왜 이런 게 필요한가**
 * ITS(9443)는 서버 경유가 전부 막혀 브라우저가 직접 호출해야 한다(계획서 부록 E).
 * 그러면 키가 브라우저에 있어야 하는데, `NEXT_PUBLIC_*`은 **빌드 시점에** 값으로
 * 치환되므로 Cloudflare의 런타임 변수로 넣으면 참조만 남고 `undefined`가 된다.
 * 여기서 런타임에 읽어 넘기면 빌드/런타임 변수 구분에 걸리지 않는다.
 *
 * **로그인한 사용자에게만** 전달한다(Bearer 토큰 검증). 키가 정적 번들에 박히면 비로그인
 * 방문자도 꺼낼 수 있으므로, 이 라우트로만 내려준다. 출처 검사와 레이트리밋도 함께 걸린다.
 */
export async function GET(request: NextRequest) {
  const blocked = await guardProxyRequest(request);
  if (blocked) return blocked;

  // 서버 전용 변수만 읽는다. NEXT_PUBLIC_*은 빌드 때 번들에 박혀 비로그인 방문자에게도 노출된다.
  const key = (process.env.ITS_API_KEY ?? "").trim();

  if (!key) {
    return NextResponse.json(
      {
        error:
          "ITS 인증키가 설정되지 않았습니다. " +
          "Cloudflare 변수에 ITS_API_KEY를 등록하세요. " +
          "(발급: https://www.its.go.kr/opendata/)",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ key }, { headers: { "Cache-Control": "no-store" } });
}
