// packages/shared/src/supabase/server.ts
// Supabase server client utilities

import { createClient } from '@supabase/supabase-js';
import { createServerClient as createSSRServerClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appScope = process.env.NEXT_PUBLIC_APP_SCOPE ?? 'app';
const authStorageKey = `sb-${appScope}-auth-token`;

/**
 * Creates a Supabase admin client using the service role key.
 * ONLY use in API routes — bypasses RLS.
 */
export function createAdminSupabaseClient() {
  if (!supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable.');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Helper to create a Supabase server client from cookies.
 * Each app passes its cookie store obtained from `cookies()` (next/headers).
 *
 * Usage in an App Router Server Component or Route Handler:
 *   import { cookies } from 'next/headers';
 *   import { createAppServerClient } from '@cafeos/shared/supabase/server';
 *
 *   const cookieStore = await cookies();
 *   const supabase = createAppServerClient(cookieStore);
 */
export function createAppServerClient(cookieStore: {
  get: (name: string) => { value: string } | undefined;
  set: (options: { name: string; value: string; [key: string]: unknown }) => void;
}) {
  return createSSRServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      name: authStorageKey,
    },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // This can happen in Server Components — safe to ignore
        }
      },
      remove(name: string, options: Record<string, unknown>) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // This can happen in Server Components — safe to ignore
        }
      },
    },
  });
}
