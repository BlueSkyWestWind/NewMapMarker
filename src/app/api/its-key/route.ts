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
 * 어차피 공개되는 값이라 이 라우트가 노출 수준을 높이지 않는다.
 * 오히려 정적 번들에 박히는 것보다 낫다 — 출처 검사와 레이트리밋이 걸린다.
 */
export async function GET(request: NextRequest) {
  const blocked = guardProxyRequest(request);
  if (blocked) return blocked;

  // 어느 이름으로 등록했든 찾도록 둘 다 본다. 이름 때문에 다시 실패하지 않게.
  const key = (
    process.env.NEXT_PUBLIC_ITS_API_KEY ??
    process.env.ITS_API_KEY ??
    ""
  ).trim();

  if (!key) {
    return NextResponse.json(
      {
        error:
          "ITS 인증키가 설정되지 않았습니다. " +
          "Cloudflare 변수에 ITS_API_KEY(또는 NEXT_PUBLIC_ITS_API_KEY)를 등록하세요. " +
          "(발급: https://www.its.go.kr/opendata/)",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ key }, { headers: { "Cache-Control": "no-store" } });
}
