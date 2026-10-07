import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env explicitly
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

if (!url || !key) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

async function clean() {
  console.log("Fetching menu items to clean up Add-ons...");
  const { data: menuItems, error: menuErr } = await supabase.from('menu_items').select('id, name, category_id');
  if (menuErr) throw menuErr;

  const { data: allVariants, error: varErr } = await supabase.from('item_variants').select('*');
  if (varErr) throw varErr;

  console.log(`Found ${menuItems.length} items and ${allVariants.length} total variants/add-ons.`);

  let deletedCount = 0;
  const toDelete: string[] = [];

  for (const item of menuItems) {
    const itemName = item.name.toLowerCase();
    const isAmericano = itemName.includes('americano');
    const isHotLatte = itemName.includes('latte') && !item.name.includes('Matcha');
    const isFrappe = [
        'Vanilla Milkshake', 'Cookies & Cream', 'Dark Chocolate', 
        'Matcha Frappe', 'Strawberries & Cream', 'Caramel Frappe', 
        'Mocha Frappe', 'Java Chip', 'Salted Caramel Frappe', 'Biscoff Frappe'
    ].includes(item.name);
    const isMilkTea = [
        'Classic Milk Tea', 'Wintermelon', 'Okinawa', 
        'Dark Chocolate MT', 'Taro', 'Cookies & Cream MT'
    ].includes(item.name);
    const isRefresher = [
        'Strawberry Soda', 'Blueberry Soda', 'Green Apple Soda', 
        'Lychee Soda', 'Honey Peach Soda'
    ].includes(item.name);
    const isFood = [
        'Just Croffle', 'S\'mores', 'Banatella', 'Biscoff Croffle', 
        'Almond Nutella', 'Ham & Cheese', 'Flavored Fries', 'Nachos', 'Chicken Pop'
    ].includes(item.name);

    // Get item's variants
    const vars = allVariants.filter(v => v.menu_item_id === item.id && v.variant_group === 'add_on');

    for (const v of vars) {
      const vlbl = v.label;
      let shouldDelete = false;

      // Rule 1: No add-ons for Americano or Food or Refreshers
      if (isAmericano || isFood || isRefresher) {
        shouldDelete = true;
      }
      
      // Rule 2: No Nata de Coco for hot coffee lattes
      if (isHotLatte && vlbl === 'Nata de Coco') {
        shouldDelete = true;
      }

      // Rule 3: No Jellies/Tapioca for Frappes
      if (isFrappe && ['Tapioca Pearls', 'Coffee Jelly', 'Nata de Coco'].includes(vlbl)) {
        shouldDelete = true;
      }
      if (isFrappe && !['Mocha Frappe', 'Java Chip', 'Caramel Frappe', 'Salted Caramel Frappe', 'Biscoff Frappe'].includes(item.name) && vlbl === 'Extra Shot') {
        shouldDelete = true; // no extra shot in fruit frappes
      }

      // Rule 4: No Whipped Cream/Extra Shot/Choco Drizzle on Milk Teas
      if (isMilkTea && ['Whipped Cream', 'Extra Shot', 'Chocolate Drizzle'].includes(vlbl)) {
        shouldDelete = true;
      }

      if (shouldDelete) {
        toDelete.push(v.id);
      }
    }
  }

  console.log(`Identified ${toDelete.length} inappropriate add-ons to wipe.`);
  
  // Delete in batches of 100
  for (let i = 0; i < toDelete.length; i += 100) {
    const chunk = toDelete.slice(i, i + 100);
    const { error } = await supabase.from('item_variants').delete().in('id', chunk);
    if (error) {
      console.error("Error deleting:", error);
    } else {
      deletedCount += chunk.length;
    }
  }

  console.log(`Successfully cleaned up ${deletedCount} bad add-on variants!`);
}

clean().catch(console.error);
