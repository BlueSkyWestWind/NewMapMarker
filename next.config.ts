import type { NextConfig } from 'next';
import { SECURITY_HEADERS } from './src/lib/security-headers';

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    // 모든 경로에 보안 헤더를 붙인다(목록과 이유는 src/lib/security-headers.ts).
    return [{ source: '/:path*', headers: SECURITY_HEADERS.map(({ key, value }) => ({ key, value })) }];
  },
};

export default nextConfig;
