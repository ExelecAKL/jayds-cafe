// packages/shared/src/supabase/client.ts
// Supabase browser client singleton - use in 'use client' components

import { createBrowserClient, type CookieOptions } from '@supabase/ssr';
import { browserFetch } from '../utils/request';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
function resolveAppScope() {
  if (process.env.NEXT_PUBLIC_APP_SCOPE) {
    return process.env.NEXT_PUBLIC_APP_SCOPE;
  }

  if (typeof window !== 'undefined') {
    const port = window.location.port;

    if (port === '3000') {
      return 'customer';
    }

    if (port === '3001') {
      return 'pos';
    }

    if (port === '3002') {
      return 'admin';
    }
  }

  return 'app';
}

const appScope = resolveAppScope();
const authStorageKey = `sb-${appScope}-auth-token`;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.'
  );
}

function readCookie(name: string) {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const cookieName = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(cookieName));

  return cookie ? decodeURIComponent(cookie.slice(cookieName.length)) : undefined;
}

function writeCookie(name: string, value: string, options: CookieOptions = {}) {
  if (typeof document === 'undefined') {
    return;
  }

  const segments = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    segments.push(`Max-Age=${options.maxAge}`);
  }

  if (options.domain) {
    segments.push(`Domain=${options.domain}`);
  }

  segments.push(`Path=${options.path ?? '/'}`);

  if (options.expires) {
    segments.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.sameSite) {
    const sameSite =
      typeof options.sameSite === 'string' ? options.sameSite : 'Lax';
    segments.push(`SameSite=${sameSite}`);
  }

  if (options.secure) {
    segments.push('Secure');
  }

  document.cookie = segments.join('; ');
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: browserFetch },
  cookieOptions: {
    name: authStorageKey,
  },
  cookies: {
    get(name: string) {
      return readCookie(name);
    },
    set(name: string, value: string, options: CookieOptions) {
      writeCookie(name, value, options);
    },
    remove(name: string, options: CookieOptions) {
      writeCookie(name, '', { ...options, maxAge: 0 });
    },
  },
  auth: {
    storageKey: authStorageKey,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
