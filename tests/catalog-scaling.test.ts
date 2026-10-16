import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('sold-out mandatory ingredients prune option searches without hiding smaller sizes or valid substitutions',async()=>{
 const db=new PGlite();const product='20000000-0000-4000-8000-000000000001',milk='30000000-0000-4000-8000-000000000001',oat='30000000-0000-4000-8000-000000000002';
 try{
  await db.exec(readFileSync('tests/fixtures/inventory-base.sql','utf8'));
  await db.query("INSERT INTO menu_items(id,name,price) VALUES($1,'Drink',112)",[product]);
  await db.query("INSERT INTO ingredients(id,name,current_stock) VALUES($1,'Milk',0),($2,'Oat',20)",[milk,oat]);
  await db.query("INSERT INTO menu_item_ingredients(menu_item_id,ingredient_id,quantity_used,size_multipliers) VALUES($1,$2,10,'{\"Small\":0.5}')",[product,milk]);
  await db.query("INSERT INTO item_variants(menu_item_id,variant_group,label,is_default) VALUES($1,'size','Medium',true),($1,'size','Small',false)",[product]);
  await db.exec(readFileSync('supabase/migrations/20261002000100_inventory_operations.sql','utf8'));
  await db.exec("UPDATE inventory_settings SET enforcement_enabled=true; SELECT set_config('request.jwt.claim.role','service_role',false)");
  await db.exec(readFileSync('supabase/migrations/20261016001500_catalog_availability_scaling.sql','utf8'));
  const available=async()=>(await db.query<{value:boolean}>('SELECT inv_any_configuration_available($1) value',[product])).rows[0].value;
  assert.equal(await available(),false);
  await db.query("INSERT INTO stock_batches(ingredient_id,batch_code,quantity,unit_cost) VALUES($1,'COUNTED-1',5,1)",[milk]);
  assert.equal(await available(),true,'Small size stays available when the default size is short');
  await db.query('UPDATE stock_batches SET quantity=0 WHERE ingredient_id=$1',[milk]);
  await db.query("INSERT INTO item_variants(menu_item_id,variant_group,label,is_default) VALUES($1,'milk_sub','Oat',false)",[product]);
  await db.query("INSERT INTO variant_ingredients(variant_group,variant_label,ingredient_id,quantity_used,replaces_ingredient_id) VALUES('milk_sub','Oat',$1,10,$2)",[oat,milk]);
  assert.equal(await available(),true,'An available replacement can still be chosen explicitly');
  await db.query('UPDATE stock_batches SET quantity=0 WHERE ingredient_id=$1',[oat]);
  assert.equal(await available(),false);
 }finally{await db.close();}
});
