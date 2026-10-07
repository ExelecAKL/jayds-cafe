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
  const { data, error } = await sb.rpc('execute_sql', { sql_query: "SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE tablename IN ('menu_items', 'categories', 'item_variants', 'vouchers', 'ingredients');" });
  if (error) {
     console.log('Cannot execute raw SQL via RPC unless set up. Error:', error);
  } else {
     console.log(data);
  }
}
run();
