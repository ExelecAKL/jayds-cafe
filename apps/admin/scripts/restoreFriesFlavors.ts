import type { VariantInsert } from './types.ts';
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

const supabase = createClient(url, key);

async function run() {
  console.log("Fetching Fries...");
  const { data: menuItems } = await supabase.from('menu_items')
    .select('id, name')
    .ilike('name', '%Fries%');
    
  if (!menuItems || menuItems.length === 0) {
     console.log("No Fries found.");
     return;
  }
  
  console.log("Found Fries:", menuItems.map(m => m.name));
  
  const toInsert: VariantInsert[] = [];
  const flavors = ['Cheese', 'Sour Cream', 'BBQ'];
  
  for (const item of menuItems) {
     for (const f of flavors) {
        toInsert.push({
           menu_item_id: item.id,
           variant_group: 'flavor',
           label: f,
           price_modifier: 0,
           is_default: f === 'Cheese',
           sort_order: flavors.indexOf(f)
        });
     }
  }
  
  if (toInsert.length > 0) {
      console.log(`Inserting ${toInsert.length} flavors...`);
      const { data, error } = await supabase.from('item_variants').insert(toInsert);
      console.log("Result:", data, error);
  }
}
run();
