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

if (!url || !key) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  console.log("Seeding Premium Add-ons and Raw Materials...");

  // 1. Insert new Ingredients
  const ingredients = [
    { name: 'Almond Milk', unit: 'ml', current_stock: 3000, min_stock_alert: 300, cost_per_unit: 0.15, supplier: 'Plant Milk PH' },
    { name: 'Sea Salt Foam Base', unit: 'g', current_stock: 1000, min_stock_alert: 100, cost_per_unit: 0.50, supplier: 'Dairy Fresh' }
  ];

  for (const ing of ingredients) {
    const { error } = await supabase.from('ingredients').insert(ing).select().single(); 
    if (error && !error.message.includes('duplicate key')) {
      console.log(error.message);
    }
  }

  // Refetch all to get IDs
  const { data: allIngs } = await supabase.from('ingredients').select('id, name');
  if (!allIngs) throw new Error('Failed to load allIngs');
  const getIngId = (name: string) => allIngs.find(i => i.name === name)?.id;

  const oatMilkId = getIngId('Oat Milk');
  const almondMilkId = getIngId('Almond Milk');
  const seaSaltId = getIngId('Sea Salt Foam Base');
  const cookiesId = getIngId('Cookies Crumble');
  const wholeMilkId = getIngId('Whole Milk');

  if (!oatMilkId || !almondMilkId || !seaSaltId || !cookiesId || !wholeMilkId) {
    console.error("Could not locate required ingredients in DB.");
    return;
  }

  console.log("Establishing Variant Recipes...");

  // 2. Map Variant Labels to Ingredients
  const variantIngs = [
    { variant_label: 'Oat Milk Sub', variant_group: 'milk_sub', ingredient_id: oatMilkId, quantity_used: 200, replaces_ingredient_id: wholeMilkId },
    { variant_label: 'Almond Milk Sub', variant_group: 'milk_sub', ingredient_id: almondMilkId, quantity_used: 200, replaces_ingredient_id: wholeMilkId },
    { variant_label: 'Sea Salt Foam', variant_group: 'add_on', ingredient_id: seaSaltId, quantity_used: 20, replaces_ingredient_id: null },
    { variant_label: 'Crushed Oreos', variant_group: 'add_on', ingredient_id: cookiesId, quantity_used: 15, replaces_ingredient_id: null },
  ];

  for (const vi of variantIngs) {
    const { error } = await supabase.from('variant_ingredients').upsert(vi, { onConflict: 'variant_label,variant_group,ingredient_id' });
    if (error) console.error(`Error mapping ${vi.variant_label}: ${error.message}`);
  }

  console.log("Binding new variants to specific Menu Items...");

  // 3. Assign variants to actual drinks
  const { data: menuItems } = await supabase.from('menu_items').select('id, name, category_id');
  if (!menuItems) throw new Error('Failed to load menuItems');

  const toInsertVars: VariantInsert[] = [];
  
  for (const item of menuItems) {
    const itemName = item.name.toLowerCase();
    
    // Lattes get Milk Substitutions
    if (itemName.includes('latte') && !item.name.includes('Matcha')) {
      toInsertVars.push({ menu_item_id: item.id, variant_group: 'milk_sub', label: 'Whole Milk', price_modifier: 0, is_default: true, sort_order: 0 });
      toInsertVars.push({ menu_item_id: item.id, variant_group: 'milk_sub', label: 'Oat Milk Sub', price_modifier: 30, is_default: false, sort_order: 1 });
      toInsertVars.push({ menu_item_id: item.id, variant_group: 'milk_sub', label: 'Almond Milk Sub', price_modifier: 30, is_default: false, sort_order: 2 });
    }

    // Milk Teas, Matcha, and Iced Lattes (For now, we'll give Sea Salt Foam to all non-fruit signatures and milk teas)
    const isMilkTea = item.category_id === 'c0000000-0000-4000-a000-000000000004';
    const isSignature = item.category_id === 'c0000000-0000-4000-a000-000000000002';
    
    if (isMilkTea || (isSignature && !itemName.includes('nom yen') && !itemName.includes('strawberry'))) {
      toInsertVars.push({ menu_item_id: item.id, variant_group: 'add_on', label: 'Sea Salt Foam', price_modifier: 25, is_default: false, sort_order: 20 });
    }

    // Frappes and Milk Teas get Crushed Oreos
    const isFrappe = item.category_id === 'c0000000-0000-4000-a000-000000000003';
    if (isFrappe || isMilkTea) {
      toInsertVars.push({ menu_item_id: item.id, variant_group: 'add_on', label: 'Crushed Oreos', price_modifier: 15, is_default: false, sort_order: 21 });
    }
  }

  // Insert missing rows carefully to avoid polluting db
  for (let i = 0; i < toInsertVars.length; i += 100) {
    // Let's do a simple loop and insert them 1 by 1 and ignore duplicate errors, since item_variants does not have a comprehensive unique constraint.
    // Wait, to safely insert, we should check if they already exist.
  }

  const { data: existingVars } = await supabase.from('item_variants').select('menu_item_id, label, variant_group');
  if (!existingVars) throw new Error('Failed to load existingVars');
  
  const cleanToInsert = toInsertVars.filter(tv => {
    return !existingVars.some(ev => ev.menu_item_id === tv.menu_item_id && ev.label === tv.label && ev.variant_group === tv.variant_group);
  });

  if (cleanToInsert.length > 0) {
    await supabase.from('item_variants').insert(cleanToInsert);
  }

  console.log(`Database Successfully Upgraded! Migrated ${cleanToInsert.length} new premium configurations.`);
}

run().catch(console.error);
