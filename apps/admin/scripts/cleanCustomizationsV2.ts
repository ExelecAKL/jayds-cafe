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
  console.log("Fetching DB state for V2 Surgical Customization Wipe...");
  
  const { data: menuItems } = await supabase.from('menu_items').select('id, name, category_id, category:categories(name)').returns<MenuWithCategory[]>();
  if (!menuItems) throw new Error('Failed to load menuItems');
  const { data: allVariants } = await supabase.from('item_variants').select('*');
  if (!allVariants) throw new Error('Failed to load allVariants');
  const { data: ingredients } = await supabase.from('ingredients').select('id, name');
  if (!ingredients) throw new Error('Failed to load ingredients');

  let deletedCount = 0;
  const toDelete: string[] = [];
  const toInsert: VariantInsert[] = [];

  const getIngId = (name: string) => ingredients.find(i => i.name === name)?.id;

  // Track new variants to prevent duplicates during mapping
  const newVariantMaps = [
    { label: 'Extra Strawberry Puree', ing: 'Strawberry Puree' },
    { label: 'Extra Blueberry Puree', ing: 'Blueberry Puree' },
    { label: 'Extra Green Apple Puree', ing: 'Green Apple Puree' },
    { label: 'Extra Lychee Puree', ing: 'Lychee Puree' },
    { label: 'Extra Honey Peach Puree', ing: 'Honey Peach Puree' }
  ];

  // 1. Map new variants physically to ingredients
  for (const vm of newVariantMaps) {
    const ingId = getIngId(vm.ing);
    if (ingId) {
      await supabase.from('variant_ingredients').upsert({
        variant_label: vm.label,
        variant_group: 'add_on',
        ingredient_id: ingId,
        quantity_used: 15 // 15ml extra pump
      }, { onConflict: 'variant_label,variant_group,ingredient_id' });
    }
  }

  for (const item of menuItems) {
    const category = item.category?.name || '';
    const itemName = item.name;
    const variants = allVariants.filter(v => v.menu_item_id === item.id);

    // Refreshers EXTRA PUMP bindings
    if (category === 'Refreshers') {
      let pureeName = '';
      if (itemName.includes('Strawberry')) pureeName = 'Extra Strawberry Puree';
      if (itemName.includes('Blueberry')) pureeName = 'Extra Blueberry Puree';
      if (itemName.includes('Green Apple')) pureeName = 'Extra Green Apple Puree';
      if (itemName.includes('Lychee')) pureeName = 'Extra Lychee Puree';
      if (itemName.includes('Honey Peach')) pureeName = 'Extra Honey Peach Puree';

      if (pureeName && !allVariants.some(v => v.menu_item_id === item.id && v.label === pureeName)) {
        toInsert.push({
          menu_item_id: item.id,
          variant_group: 'add_on',
          label: pureeName,
          price_modifier: 20,
          is_default: false,
          sort_order: 15
        });
      }
    }

    for (const v of variants) {
      const g = v.variant_group;
      const l = v.label;
      let shouldDelete = false;

      // RULE 1: Snacks and Croffles -> NUKE ALL
      if (category === 'Snacks' || category === 'Croffles') {
        shouldDelete = true;
      }

      // RULE 2: Refreshers -> NUKE ALL original modifiers (including sugar levels), keep ONLY the specific Extra Puree we just added above.
      if (category === 'Refreshers') {
        // We delete everything that isn't an "Extra [Fruit] Puree"
        if (!l.includes('Extra') || !l.includes('Puree')) {
            shouldDelete = true;
        }
      }

      // RULE 3: Espresso
      if (category === 'Espresso') {
        if (itemName === 'Americano' && g !== 'sugar_level' && g !== 'size') {
          shouldDelete = true; // Americano keeps ONLY sugar & size! (No milk subs, no addons). Wait, milk subs shouldn't be deleted if the user manually adds them, but let's strictly adhere to the business rules.
        } else if (itemName !== 'Americano' && l === 'Nata de Coco') {
          shouldDelete = true; // Hot lattes = No Nata.
        }
      }

      // RULE 4: Frappes
      if (category === 'Frappes') {
        if (['Tapioca Pearls', 'Coffee Jelly', 'Nata de Coco'].includes(l)) {
          shouldDelete = true;
        }
        
        const isCoffeeFrappe = ['Mocha Frappe', 'Java Chip', 'Caramel Frappe', 'Salted Caramel Frappe', 'Biscoff Frappe'].includes(itemName);
        if (!isCoffeeFrappe && l === 'Extra Shot') {
          shouldDelete = true;
        }
      }

      // RULE 5: Milk Teas
      if (category === 'Milk Teas') {
        if (['Whipped Cream', 'Chocolate Drizzle', 'Extra Shot'].includes(l)) {
          shouldDelete = true;
        }
      }

      // RULE 6: Signature Drinks
      if (category === 'Signature Drinks') {
        const trueNonCoffee = ['Cocoa Lava', 'Matcha Latte', 'Nom Yen Pink Milk', 'Strawberry Milk'];
        if (trueNonCoffee.includes(itemName)) {
          if (['Extra Shot', 'Coffee Jelly'].includes(l)) {
            shouldDelete = true;
          }
          if (itemName === 'Cocoa Lava' && l === 'Chocolate Drizzle') {
            shouldDelete = true;
          }
        }
        
        // Remove Nata de coco from all signature HOT/COFFEE drinks as a general safe measure except fruit/matcha variants.
        if (!['Nom Yen Pink Milk', 'Strawberry Milk', 'Matcha Latte'].includes(itemName) && l === 'Nata de Coco') {
            shouldDelete = true;
        }
      }

      // Final Queue
      if (shouldDelete) {
        toDelete.push(v.id);
      }
    }
  }

  console.log(`Identified ${toDelete.length} inappropriate add-ons to wipe via Strict Category Routing.`);
  
  for (let i = 0; i < toDelete.length; i += 100) {
    const chunk = toDelete.slice(i, i + 100);
    const { error } = await supabase.from('item_variants').delete().in('id', chunk);
    if (error) {
      console.error("Error deleting in batch:", error.message);
    } else {
      deletedCount += chunk.length;
    }
  }

  console.log(`Successfully mapped and wiped ${deletedCount} incorrect add-ons!`);

  if (toInsert.length > 0) {
    const { error } = await supabase.from('item_variants').insert(toInsert);
    if (error) console.error("Error inserting custom fruit purees:", error);
    else console.log(`Successfully inserted ${toInsert.length} custom Extra Puree setups for Refreshers!`);
  }
}

run().catch(console.error);
