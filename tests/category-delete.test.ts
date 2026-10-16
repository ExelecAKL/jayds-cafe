import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("category permanent deletion preserves linked products as the Admin confirmation promises", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA cron; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); CREATE SCHEMA extensions;
      CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
      CREATE FUNCTION extensions.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql AS $$ SELECT substring(decode(repeat(md5(gen_random_uuid()::text),ceil($1/16.0)::integer),'hex') FROM 1 FOR $1) $$;
      SET search_path=public,extensions;
      CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
      CREATE PUBLICATION supabase_realtime;
      SELECT set_config('request.jwt.claim.role','service_role',false);`);
    for (const file of readdirSync("supabase/migrations").filter(file => file.endsWith(".sql")).sort()) {
      await db.exec(readFileSync("supabase/migrations/" + file, "utf8").replace("CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;", ""));
    }
    const { rows: categories } = await db.query<{ id: string }>("INSERT INTO categories(name) VALUES('Isolated category deletion audit') RETURNING id");
    const { rows: products } = await db.query<{ id: string }>("INSERT INTO menu_items(name,price,category_id) VALUES('Isolated product which must survive',100,$1) RETURNING id", [categories[0].id]);
    await db.query("INSERT INTO item_variants(menu_item_id,variant_group,label,price_modifier) VALUES($1,'add_on','Preserved optional extra',5)",[products[0].id]);
    const ingredient=(await db.query<{id:string}>("INSERT INTO ingredients(name,unit,current_stock,cost_per_unit) VALUES('Isolated preserved ingredient','g',0,1) RETURNING id")).rows[0].id;
    await db.query("INSERT INTO menu_item_ingredients(menu_item_id,ingredient_id,quantity_used) VALUES($1,$2,1)",[products[0].id,ingredient]);
    // This is the exact DELETE issued by CategoriesPage.handleDelete.
    await db.query("DELETE FROM categories WHERE id=$1", [categories[0].id]);
    const remaining = (await db.query<{ category_id: string | null }>("SELECT category_id FROM menu_items WHERE id=$1", [products[0].id])).rows;
    assert.equal(remaining.length, 1, "Deleting a category must not silently delete its products");
    assert.equal(remaining[0].category_id, null);
    assert.equal((await db.query<{count:number}>("SELECT count(*)::integer count FROM item_variants WHERE menu_item_id=$1",[products[0].id])).rows[0].count,1,'Product options survive category deletion');
    assert.equal((await db.query<{count:number}>("SELECT count(*)::integer count FROM menu_item_ingredients WHERE menu_item_id=$1",[products[0].id])).rows[0].count,1,'Recipes survive category deletion');
    for(const role of ['anon','authenticated']) {
      assert.equal((await db.query<{allowed:boolean}>("SELECT has_function_privilege($1,'public.customer_configure_push_worker(text,text)','EXECUTE') allowed",[role])).rows[0].allowed,false);
      assert.equal((await db.query<{allowed:boolean}>("SELECT has_function_privilege($1,'public.customer_push_setup_status()','EXECUTE') allowed",[role])).rows[0].allowed,false);
    }
    const setup=(await db.query<{state:{vault_configured:boolean;cron_active:boolean}}>("SELECT customer_push_setup_status() state")).rows[0].state;
    assert.equal(setup.vault_configured,false); assert.equal(setup.cron_active,false);
    const customer='10000000-0000-4000-8000-000000000123';
    await db.query("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,'tier-regression@example.invalid','{\"role\":\"customer\"}')",[customer]);
    const voucher=(await db.query<{id:string}>("INSERT INTO vouchers(code,discount_type,discount_value,target_tier) VALUES('SQLGOLD','fixed',10,' Gold ') RETURNING id")).rows[0].id;
    const items=JSON.stringify([{menu_item_id:products[0].id,quantity:1,price:100,subtotal:100,variants:[]}]);
    const order={customer_id:customer,order_source:'app',order_type:'pickup',payment_method:'cash',subtotal:100,discount:10,total:90,points_redeemed:0,legal_version:'2026-10-07'};
    const submit=(customerId:string|null,key:string)=>db.query("SELECT inv_create_order($1::jsonb,$2::jsonb,$3,$4::uuid,$5,'tier-regression')",[JSON.stringify({...order,customer_id:customerId}),items,key,customerId,voucher]);
    await assert.rejects(submit(customer,'tier-bronze-rejected-key'),/loyalty tier|eligible/i);
    await assert.rejects(submit(null,'tier-guest-rejected-key'),/loyalty tier|eligible/i);
    assert.equal((await db.query<{uses_count:number}>("SELECT uses_count FROM vouchers WHERE id=$1",[voucher])).rows[0].uses_count,0,'Rejected tier redemptions roll back voucher usage');
    await db.query("UPDATE profiles SET points=100000 WHERE id=$1",[customer]);
    assert.equal((await db.query<{loyalty_tier:string}>("SELECT loyalty_tier FROM profiles WHERE id=$1",[customer])).rows[0].loyalty_tier.toLowerCase(),'gold');
    await submit(customer,'tier-gold-accepted-key');
    assert.equal((await db.query<{uses_count:number}>("SELECT uses_count FROM vouchers WHERE id=$1",[voucher])).rows[0].uses_count,1,'Eligible transactional redemption uses voucher once');

  } finally { await db.close(); }
});
