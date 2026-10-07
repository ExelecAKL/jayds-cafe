import type { MenuWithCategory } from './types.ts';
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
  const { data: menuItems } = await sb.from('menu_items').select('id, name, category:categories(name)').returns<MenuWithCategory[]>();
  if (!menuItems) throw new Error('Failed to load menuItems');
  const { data: iv } = await sb.from('item_variants').select('*').in('variant_group', ['add_on', 'milk_sub', 'sugar_level']);
  if (!iv) throw new Error('Failed to load iv');

  const map: Record<string, { name: string; category: string; addons: string[] }> = {};
  menuItems.forEach(m => map[m.id] = { name: m.name, category: m.category?.name ?? '', addons: [] });
  iv.forEach(v => {
    if (map[v.menu_item_id]) map[v.menu_item_id].addons.push(v.label);
  });

  const lines: string[] = [];
  Object.values(map).forEach(m => {
    lines.push(`- [${m.category}] ${m.name}: ${m.addons.join(', ') || 'NONE'}`);
  });
  
  lines.sort();
  fs.writeFileSync(path.join(__dirname, 'addons_dump.txt'), lines.join('\n'));
}
run();
