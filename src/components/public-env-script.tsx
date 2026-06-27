import { getServerPublicEnv } from '@/lib/public-env';

export function PublicEnvScript() {
  const publicEnv = getServerPublicEnv();

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.__PUBLIC_ENV__=${JSON.stringify(publicEnv)};`,
      }}
    />
  );
}
