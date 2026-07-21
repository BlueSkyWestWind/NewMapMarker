import { NextRequest, NextResponse } from 'next/server';
import { guardProxyRequest } from '@/lib/api/proxy-guard';

export async function GET(request: NextRequest) {
  const blocked = guardProxyRequest(request);
  if (blocked) return blocked;

  const panoId = request.nextUrl.searchParams.get('panoId');
  if (!panoId) {
    return NextResponse.json(
      { error: 'panoId 파라미터가 필요합니다.' },
      { status: 400 },
    );
  }

  // panoId를 그대로 경로에 넣으면 '/'·'?' 등이 경로를 벗어나게 만들 수 있으므로 인코딩한다.
  const targetUrl = `https://rv.map.kakao.com/roadview-search/v2/node/${encodeURIComponent(panoId)}?SERVICE=csspano`;

  try {
    const response = await fetch(targetUrl, {
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // 촬영일자는 자주 바뀌지 않으므로 캐시해 쿼터를 절약한다.
        'Cache-Control': response.ok
          ? 'public, max-age=3600, s-maxage=86400'
          : 'no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { error: '카카오 로드뷰 API 요청에 실패했습니다.' },
      { status: 504 },
    );
  }
}
