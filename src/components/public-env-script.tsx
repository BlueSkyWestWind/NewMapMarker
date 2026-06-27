import Script from 'next/script';
import { getServerPublicEnv } from '@/lib/public-env';

export function PublicEnvScript() {
  const publicEnv = getServerPublicEnv();

  return (
    <Script
      id="public-env"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{
        __html: `window.__PUBLIC_ENV__=${JSON.stringify(publicEnv)};`,
      }}
    />
  );
}
