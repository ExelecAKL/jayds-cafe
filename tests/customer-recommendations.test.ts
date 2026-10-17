import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import type { MenuItem, Order } from "../packages/shared/src/types/index.ts";
import {
  buildHomeRecommendations,
  type RecommendationHistory,
} from "../apps/customer/utils/recommendations.ts";
import { buildReorderDraft } from "../apps/customer/utils/orderReorder.ts";
const product = (
  id: string,
  category = "coffee",
  tags = ["coffee", "vanilla"],
) =>
  ({
    id,
    name: id,
    category_id: category,
    tags,
    status: "active",
    is_available: true,
    sort_order: 1,
    price: 100,
    variants: [],
    image_url: null,
    prep_time_minutes: 4,
  }) as unknown as MenuItem;
const purchase = (id: string, weight = 1, last = "2026-10-08T00:00:00Z") => ({
  menu_item_id: id,
  name: id,
  price: 90,
  variants: [],
  weight,
  last_order_at: last,
  purchase_count: 1,
});

test("personal suggestions exclude bought, archived, sold-out and unrelated products; no-history gets none", () => {
  const catalog = [
    product("usual"),
    product("vanilla"),
    product("tea", "tea", ["tea"]),
    { ...product("archived"), status: "archived" } as MenuItem,
    { ...product("sold"), is_available: false },
  ];
  assert.deepEqual(
    buildHomeRecommendations({ hasOrderHistory: false, products: [] }, catalog),
    { hasOrderHistory: false, orderAgain: [], suggestions: [] },
  );
  const result = buildHomeRecommendations(
    {
      hasOrderHistory: true,
      products: [purchase("usual"), purchase("tea", 0, "2026-09-01")],
    },
    catalog,
  );
  assert.deepEqual(
    result.orderAgain.map((x) => x.product.id),
    ["usual", "tea"],
  );
  assert.deepEqual(
    result.suggestions.map((x) => x.product.id),
    ["vanilla"],
  );
  assert.equal(result.suggestions[0].reason, "Similar to your usual");
  assert.equal(result.orderAgain[0].previous.price, 90);
});
test("recency/frequency weights change each account's ranking and order-again uses newest purchases", () => {
  const catalog = [
    product("usual-coffee"),
    product("usual-tea", "tea", ["tea"]),
    product("new-coffee"),
    product("new-tea", "tea", ["tea"]),
  ];
  const history = (
    coffeeWeight: number,
    teaWeight: number,
  ): RecommendationHistory => ({
    hasOrderHistory: true,
    products: [
      purchase("usual-coffee", coffeeWeight, "2026-09-01"),
      purchase("usual-tea", teaWeight),
    ],
  });
  const a = buildHomeRecommendations(history(5, 1), catalog),
    b = buildHomeRecommendations(history(1, 5), catalog);
  assert.equal(a.suggestions[0].product.id, "new-coffee");
  assert.equal(b.suggestions[0].product.id, "new-tea");
  assert.equal(a.orderAgain[0].product.id, "usual-tea");
  assert.deepEqual(
    buildHomeRecommendations(history(5, 1), [...catalog].reverse()),
    a,
  );
});
test("suggestions diversify similarly ranked categories, cap at four, and remain empty without relevant anchors", () => {
  const catalog = [
    product("usual"),
    ...["a", "b", "c", "d"].map((id) => product(id)),
    product("e", "signature"),
  ];
  const result = buildHomeRecommendations(
    { hasOrderHistory: true, products: [purchase("usual")] },
    catalog,
  );
  assert.equal(result.suggestions.length, 4);
  // Category variety is preferred within 20% of the competing score.
  const diverse = buildHomeRecommendations(
    {
      hasOrderHistory: true,
      products: [purchase("usual"), purchase("second", 1)],
    },
    [...catalog, product("second", "signature")],
  );
  assert.ok(
    diverse.suggestions.some(
      (entry) => entry.product.category_id === "signature",
    ),
  );
  assert.deepEqual(
    buildHomeRecommendations(
      { hasOrderHistory: true, products: [purchase("deleted")] },
      catalog,
    ).suggestions,
    [],
  );
});
test("reorder rejects newly required groups, incompatible sizes and duplicate options, but allows distinct add-ons", () => {
  const item = {
    ...product("usual"),
    variants: [
      { variant_group: "size", label: "16oz", price_modifier: 0 },
      { variant_group: "temperature", label: "Hot", price_modifier: 0 },
      { variant_group: "temperature", label: "Iced", price_modifier: 0 },
      { variant_group: "add_on", label: "Jelly", price_modifier: 20 },
      { variant_group: "add_on", label: "Cream", price_modifier: 20 },
    ],
  } as MenuItem;
  const draft = (variants: unknown[]) =>
    buildReorderDraft(
      {
        items: [
          {
            menu_item_id: item.id,
            name: item.name,
            price: 100,
            quantity: 1,
            notes: "",
            variants,
          },
        ],
      } as Order,
      [item],
    );
  assert.equal(draft([item.variants![0]]).items.length, 0);
  assert.equal(draft(item.variants!.slice(0, 2)).items.length, 0);
  assert.equal(
    draft([item.variants![0], item.variants![2], item.variants![0]]).items
      .length,
    0,
  );
  const valid = draft([item.variants![0], ...item.variants!.slice(2)]);
  assert.equal(valid.items[0].price, 140);
  assert.equal(valid.issues.length, 1);
});

test("database history includes linked app/POS paid completions, deduplicates units and reads beyond 200 orders", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE orders(id uuid PRIMARY KEY,customer_id uuid,status text,payment_status text,is_parked boolean DEFAULT false,order_source text,created_at timestamptz);
      CREATE TABLE order_items(id uuid PRIMARY KEY,order_id uuid,menu_item_id uuid,name text,price numeric,variants jsonb,quantity int,created_at timestamptz);`);
    await db.exec(
      readFileSync(
        "supabase/migrations/20261008000100_customer_recommendations.sql",
        "utf8",
      ),
    );
    const owner = "10000000-0000-4000-8000-000000000001",
      other = "10000000-0000-4000-8000-000000000002";
    await db.exec(`INSERT INTO orders SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${owner}','completed','paid',false,
      CASE WHEN n%2=0 THEN 'pos' ELSE 'app' END,now()-interval '60 days' FROM generate_series(1,255) n;
      INSERT INTO order_items SELECT ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
      ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Product '||n,100,'[]',5,now() FROM generate_series(1,255) n;
      INSERT INTO order_items SELECT '30000000-0000-4000-8000-000000000999',id,'40000000-0000-4000-8000-000000000001','Duplicate line',110,'[]',10,now() FROM orders ORDER BY id LIMIT 1;
      INSERT INTO orders VALUES ('20000000-0000-4000-8000-000000000500','${other}','completed','paid',false,'pos',now());
      INSERT INTO order_items VALUES ('30000000-0000-4000-8000-000000000500','20000000-0000-4000-8000-000000000500','40000000-0000-4000-8000-000000000500','Other account',100,'[]',1,now());`);
    for (const [i, status, payment, parked] of [
      [600, "pending", "pending", false],
      [601, "cancelled", "paid", false],
      [602, "completed", "refunded", false],
      [603, "completed", "paid", true],
      [604, "completed", "pending", false],
    ] as const)
      await db.exec(`INSERT INTO orders VALUES('20000000-0000-4000-8000-${i.toString().padStart(12, "0")}','${owner}','${status}','${payment}',${parked},'app',now());
        INSERT INTO order_items VALUES('30000000-0000-4000-8000-${i.toString().padStart(12, "0")}','20000000-0000-4000-8000-${i.toString().padStart(12, "0")}','40000000-0000-4000-8000-${i.toString().padStart(12, "0")}','Excluded',100,'[]',1,now());`);
    const read = async (id: string) =>
      (
        await db.query<{ history: RecommendationHistory }>(
          "SELECT get_customer_recommendation_history($1) history",
          [id],
        )
      ).rows[0].history;
    const result = await read(owner);
    assert.equal(result.hasOrderHistory, true);
    assert.equal(result.products.length, 255);
    assert.ok(
      result.products.every(
        (row) =>
          row.purchase_count === 1 &&
          Math.abs(Number(row.weight) - 0.5) < 0.00001,
      ),
    );
    assert.equal(
      result.products.find((row) => row.menu_item_id.endsWith("001"))?.price,
      110,
    );
    assert.equal((await read(other)).products.length, 1);
    assert.deepEqual(await read("10000000-0000-4000-8000-000000000009"), {
      hasOrderHistory: false,
      products: [],
    });
    await db.exec("SET ROLE authenticated");
    await assert.rejects(read(owner), /permission denied/);
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(read(owner), /permission denied/);
    await db.exec("RESET ROLE; SET ROLE service_role");
    assert.equal((await read(owner)).products.length, 255);
  } finally {
    await db.close();
  }
});

test("recommendation route derives owner from authentication, returns private reads and propagates unavailable data", async () => {
  const nodeRequire = createRequire(import.meta.url),
    calls: { name: string; args?: unknown }[] = [];
  let denied = false,
    unavailable = false;
  const loadedModule = { exports: {} };
  const source = ts.transpileModule(
    readFileSync(
      "apps/customer/app/api/customer/recommendations/route.ts",
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  class AccessError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  const headers = {
    "Cache-Control": "private, no-store",
    Vary: "Cookie, Authorization",
  };
  vm.runInNewContext(source, {
    URL,
    module: loadedModule,
    exports: loadedModule.exports,
    require: (name: string) =>
      ({
        "next/server": { NextResponse: { json: Response.json } },
        "../../../../utils/recommendations": { buildHomeRecommendations },
        "../../../../lib/server-access": {
          ApiAccessError: AccessError,
          PRIVATE_HEADERS: headers,
          apiAccessErrorResponse: (error: AccessError) =>
            Response.json(
              { error: error.message },
              { status: error.status || 500, headers },
            ),
          requireCustomer: async () => {
            if (denied) throw new AccessError("Sign in", 401);
            return {
              userId: "verified-owner",
              db: {
                rpc: async (name: string, args?: unknown) => {
                  calls.push({ name, args });
                  return unavailable
                    ? { error: {} }
                    : {
                        data:
                          name === "get_published_catalog"
                            ? { menuItems: [product("usual"), product("new")] }
                            : {
                                hasOrderHistory: true,
                                products: [purchase("usual")],
                              },
                      };
                },
              },
            };
          },
        },
      })[name] ?? nodeRequire(name),
  });
  const route = loadedModule.exports as {
    GET: (request: Request) => Promise<Response>;
  };
  const response = await route.GET(
    new Request(
      "https://jayds.test/api/customer/recommendations?customer_id=someone-else",
    ),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Cookie, Authorization");
  assert.equal(
    JSON.stringify(calls[0].args),
    JSON.stringify({ p_customer: "verified-owner" }),
  );
  const body = await response.json();
  assert.equal(body.suggestions[0].product.id, "new");
  calls.length = 0;
  const fast = await route.GET(
    new Request(
      "https://jayds.test/api/customer/recommendations?history=1&customer_id=someone-else",
    ),
  );
  assert.equal(fast.status, 200);
  assert.equal(fast.headers.get("cache-control"), "private, no-store");
  assert.equal((await fast.json()).products[0].menu_item_id, "usual");
  assert.deepEqual(
    calls.map((c) => c.name),
    ["get_customer_recommendation_history"],
    "Fast Home request never repeats the catalog query",
  );
  assert.equal(
    JSON.stringify(calls[0].args),
    JSON.stringify({ p_customer: "verified-owner" }),
  );
  unavailable = true;
  assert.equal(
    (
      await route.GET(
        new Request("https://jayds.test/api/customer/recommendations"),
      )
    ).status,
    503,
  );
  denied = true;
  const count = calls.length;
  assert.equal(
    (
      await route.GET(
        new Request("https://jayds.test/api/customer/recommendations"),
      )
    ).status,
    401,
  );
  assert.equal(calls.length, count);
});
