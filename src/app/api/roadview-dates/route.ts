import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
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
      },
    });
  } catch {
    return NextResponse.json(
      { error: '카카오 로드뷰 API 요청에 실패했습니다.' },
      { status: 504 },
    );
  }
}
