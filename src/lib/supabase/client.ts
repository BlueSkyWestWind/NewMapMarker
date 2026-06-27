'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getPublicEnv } from '@/lib/public-env';

let browserClient: SupabaseClient | null = null;
let cachedEnvSignature = '';

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const supabaseUrl = getPublicEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = getPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const envSignature = `${supabaseUrl}|${supabaseAnonKey}`;
  if (!browserClient || cachedEnvSignature !== envSignature) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    cachedEnvSignature = envSignature;
  }

  return browserClient;
}

/** @deprecated getSupabaseBrowserClient 사용 */
export function createSupabaseBrowserClient() {
  return getSupabaseBrowserClient();
}

export type SupabaseBrowserClient = SupabaseClient;
