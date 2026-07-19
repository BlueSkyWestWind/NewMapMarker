export const PUBLIC_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_KAKAO_MAP_APP_KEY',
  'NEXT_PUBLIC_VWORLD_API_KEY',
] as const;

export type PublicEnvKey = (typeof PUBLIC_ENV_KEYS)[number];

export type PublicEnv = Record<PublicEnvKey, string>;

declare global {
  interface Window {
    __PUBLIC_ENV__?: PublicEnv;
  }
}

export function getServerPublicEnv(): PublicEnv {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    NEXT_PUBLIC_KAKAO_MAP_APP_KEY: process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? '',
    NEXT_PUBLIC_VWORLD_API_KEY: process.env.NEXT_PUBLIC_VWORLD_API_KEY ?? '',
  };
}

export function getPublicEnv(key: PublicEnvKey): string {
  const buildTimeValue = process.env[key] ?? '';

  if (typeof window === 'undefined') {
    return buildTimeValue;
  }

  const runtimeValue = window.__PUBLIC_ENV__?.[key] ?? '';
  return runtimeValue || buildTimeValue;
}
