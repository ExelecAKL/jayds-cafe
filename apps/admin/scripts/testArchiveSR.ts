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

const key = env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key);

async function run() {
  const { data: items } = await sb.from('menu_items').select('id, name, status, is_available').limit(1);
  if (items && items.length > 0) {
     const item = items[0];
     console.log("Found item:", item);
     
     console.log("Attempting to update status to archived...");
     const { data, error } = await sb.from('menu_items')
        .update({ status: 'archived' })
        .eq('id', item.id)
        .select('id, name, status');
        
     console.log("Update Result:", data || error);

     // Revert
     await sb.from('menu_items').update({ status: 'active' }).eq('id', item.id);
  }
}
run();
