import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  if (line.trim() && !line.startsWith('#')) {
    const [key, ...vals] = line.split('=');
    env[key.trim()] = vals.join('=').trim().replace(/['"]/g, '');
  }
});

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const sb = createClient(url, key);

async function run() {
  const { data, error } = await sb.from('vouchers').select('*').limit(1);
  if (error) throw error;
  if (data && data.length > 0) {
    console.log(Object.keys(data[0]));
  } else {
    // try to fetch a row or we can just query pg_attribute if pg is allowed, wait supabase via rest doesn't let us query pg_attribute easily.
    // Let's just create a dummy voucher to see the layout, or we can check the sql files.
    console.log("No data");
  }
}
run();
