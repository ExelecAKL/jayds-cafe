import type { MenuWithCategory } from './types.ts';
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
  console.log("Migrating Temperature logic into DB...");
  const { data: menuItems } = await supabase.from('menu_items').select('id, name, category:categories(name)').returns<MenuWithCategory[]>();
  if (!menuItems) throw new Error('Failed to load menuItems');
  
  const toInsertVars: VariantInsert[] = [];
  
  for (const item of menuItems) {
    const category = item.category?.name || '';
    
    // Add Temperature to Espresso and Signature Drinks
    if (category === 'Espresso' || category === 'Signature Drinks') {
      toInsertVars.push({
        menu_item_id: item.id,
        variant_group: 'temperature',
        label: 'Iced',
        price_modifier: 0,
        is_default: true,
        sort_order: 1
      });
      toInsertVars.push({
        menu_item_id: item.id,
        variant_group: 'temperature',
        label: 'Hot',
        price_modifier: 0,
        is_default: false,
        sort_order: 2
      });
    }
    // Add explicitly "Iced" for Frappes, Milk Teas, Refreshers
    else if (['Frappes', 'Milk Teas', 'Refreshers'].includes(category)) {
      toInsertVars.push({
        menu_item_id: item.id,
        variant_group: 'temperature',
        label: 'Iced',
        price_modifier: 0,
        is_default: true,
        sort_order: 1
      });
    }
  }

  // Remove duplicates
  const { data: existingVars } = await supabase.from('item_variants').select('menu_item_id, label, variant_group');
  if (!existingVars) throw new Error('Failed to load existingVars');
  
  const cleanToInsert = toInsertVars.filter(tv => {
    return !existingVars.some(ev => 
      ev.menu_item_id === tv.menu_item_id && 
      ev.label === tv.label && 
      ev.variant_group === tv.variant_group
    );
  });

  if (cleanToInsert.length > 0) {
    const { error } = await supabase.from('item_variants').insert(cleanToInsert);
    if (error) console.error("Error inserting temp variants:", error);
    else console.log(`Successfully injected ${cleanToInsert.length} temperature variants.`);
  } else {
    console.log("No new temperature variants needed.");
  }
}
run();
