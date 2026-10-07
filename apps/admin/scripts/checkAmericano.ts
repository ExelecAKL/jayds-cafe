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
  const { data: menuItems } = await sb.from('menu_items').select('id').eq('name', 'Americano');
  if (!menuItems) throw new Error('Failed to load menuItems');
  if (!menuItems || menuItems.length === 0) {
    console.log("No Americano found.");
    return;
  }
  const americanoId = menuItems[0].id;
  const { data: vars } = await sb.from('item_variants').select('*').eq('menu_item_id', americanoId).eq('variant_group', 'add_on');
  console.log('Americano Add-Ons:', vars);
}
run();
