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

// MUST use ANON KEY with a real login token to accurately test RLS
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(url, key);

async function run() {
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
    email: 'admin@cafeos.ph',
    password: 'password123' // Best guess based on typical dev passwords, or we just rely on Service key?
  });
  
  if (authErr) {
    console.error("Auth error:", authErr.message);
    return;
  }
  
  // Try to update a menu item
  const { data: items } = await sb.from('menu_items').select('id, is_available').limit(1);
  if (items && items.length > 0) {
     console.log("Trying to update item:", items[0].id);
     const { data, error } = await sb.from('menu_items')
        .update({ is_available: !items[0].is_available })
        .eq('id', items[0].id)
        .select();
        
     console.log("Update response:", data, error);
  } else {
     console.log("No items found or SELECT blocked");
  }
}
run();
