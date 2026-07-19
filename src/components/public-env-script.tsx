import { getServerPublicEnv } from '@/lib/public-env';

export function PublicEnvScript() {
  const publicEnv = getServerPublicEnv();

  // JSON 안의 '<'를 유니코드 이스케이프해 값에 '</script>'가 있어도 태그가 조기 종료되지 않게 한다.
  const serialized = JSON.stringify(publicEnv).replace(/</g, '\\u003c');

  // App Router에서는 next/script beforeInteractive 대신 일반 <script>를 사용한다.
  // 서버에서 렌더된 인라인 스크립트는 하이드레이션 이전(HTML 파싱 시점)에 실행되어
  // window.__PUBLIC_ENV__ 를 클라이언트 코드보다 먼저 설정한다.
  return (
    <script
      id="public-env"
      dangerouslySetInnerHTML={{
        __html: `window.__PUBLIC_ENV__=${serialized};`,
      }}
    />
  );
}
