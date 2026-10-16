// Run after npm run build. Every Supabase request stays in an embedded test database.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { cashierJourneys } from "./pos-browser-journeys.ts";
import { completeAdminJourneys } from "./system-audit-admin-complete.ts";
import { scannerAudit } from "./system-audit-scanner.ts";
import {financeJourneys} from "./finance-browser-journeys.ts";
import {passwordJourneys} from "./password-browser-journeys.ts";
import {adminSalesJourneys} from "./admin-sales-browser-journeys.ts";
import {adminLoadingJourneys,adminUxJourneys} from "./admin-ux-browser-journeys.ts";
import {
  submissionIdentity,
  priceCatalogItems,
  type SubmittedItem,
} from "../packages/shared/src/inventory/orders.ts";
import {
  chromium,
  type BrowserContext,
  type WebSocketRoute,
} from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";

const root = process.cwd();
const existingDemoServers = process.env.JAYDS_DEMO_EXISTING_PORTS === "1";
const demoHost = existingDemoServers
  ? process.env.JAYDS_DEMO_HOST || "127.0.0.1"
  : "127.0.0.1";
const ports = existingDemoServers
  ? { customer: 4000, pos: 4001, admin: 4002 }
  : { customer: 4250, pos: 4251, admin: 4252 };
const auditUrls: Record<string, string | undefined> = {
  customer: process.env.JAYDS_AUDIT_CUSTOMER_URL,
  pos: process.env.JAYDS_AUDIT_POS_URL,
  admin: process.env.JAYDS_AUDIT_ADMIN_URL,
};
const servers: ChildProcess[] = [];
const adminId = "10000000-0000-4000-8000-000000000001";
const itemId = "20000000-0000-4000-8000-000000000001";
const stockId = "30000000-0000-4000-8000-000000000001";
const db = new PGlite();
const sockets: {
  socket: WebSocketRoute;
  topic: string;
  id: number;
  table: string;
  array: boolean;
}[] = [];
const output = path.join(root, ".codex-logs", "screens");
mkdirSync(output, { recursive: true });
let failNextSave = false;
let loseNextCheckout = false;
let loseNextPark = false;
let checkoutRequests = 0;
let heldAvailability: {
  started: () => void;
  released: Promise<void>;
} | null = null;
function holdAvailabilityRefresh() {
  let announce!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    announce = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  heldAvailability = { started: announce, released };
  return {
    started,
    release: () => {
      heldAvailability = null;
      release();
    },
  };
}
function publishOrders() {
  publishTable("pos_order_state");
  publishTable("orders");
}
function publishTable(table: string) {
  for (const s of sockets.filter((s) => s.table === table)) {
    const payload = {
      ids: [s.id],
      data: {
        schema: "public",
        table,
        type: "UPDATE",
        columns: [{ name: "id", type: table === "orders" ? "uuid" : "bool" }],
        commit_timestamp: new Date().toISOString(),
        record: { id: true, version: Date.now() },
        old_record: { id: true },
      },
    };
    try {
      s.socket.send(
        JSON.stringify(
          s.array
            ? [null, null, s.topic, "postgres_changes", payload]
            : { topic: s.topic, event: "postgres_changes", payload },
        ),
      );
    } catch {}
  }
}
function publishCatalog() {
  for (const s of sockets.filter((s) => s.table === "catalog_state")) {
    const payload = {
      ids: [s.id],
      data: {
        schema: "public",
        table: "catalog_state",
        type: "UPDATE",
        columns: [
          { name: "id", type: "bool" },
          { name: "version", type: "int8" },
        ],
        commit_timestamp: new Date().toISOString(),
        record: { id: true, version: Date.now() },
        old_record: { id: true },
      },
    };
    try {
      s.socket.send(
        JSON.stringify(
          s.array
            ? [null, null, s.topic, "postgres_changes", payload]
            : { topic: s.topic, event: "postgres_changes", payload },
        ),
      );
    } catch {
      /* Closed page. */
    }
  }
}
const numericFields = new Set([
  "quantity_used",
  "price",
  "price_modifier",
  "quantity",
  "received_quantity",
  "unit_cost",
  "current_stock",
  "cost_per_unit",
  "min_stock_alert",
  "max_stock",
  "pack_size",
  "reserved_stock",
  "available_stock",
  "incoming_stock",
  "stock_value",
  "expiring_stock",
  "reserved",
  "expected",
  "counted",
  "demand",
  "daily_demand",
  "coverage_days",
  "reorder_quantity",
  "excess_quantity",
  "expiry_risk_quantity",
  "total",
  "subtotal",
  "discount",
  "discount_value",
  "min_order_amount",
  "max_discount_amount",
  "balance_after",
]);
const restNumbers = (data: unknown) =>
  JSON.parse(JSON.stringify(data), (key, value) =>
    numericFields.has(key) && value !== null
      ? Number(value)
      : ["expires_on", "expected_on"].includes(key) && value
        ? String(value).slice(0, 10)
        : value,
  );

async function start(app: string, port: number) {
  if (auditUrls[app]) {
    assert.equal((await fetch(auditUrls[app] + "/login")).status, 200);
    return;
  }
  if (existingDemoServers) {
    assert.equal(
      (await fetch(`http://${demoHost}:${port}/login`)).status,
      200,
      `${app} demo server is ready`,
    );
    return;
  }
  const child = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/next/dist/bin/next"),
      "start",
      "-p",
      String(port),
      "-H",
      "127.0.0.1",
    ],
    { cwd: path.join(root, "apps", app), windowsHide: true, stdio: "ignore" },
  );
  servers.push(child);
  for (let n = 0; n < 100; n++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/login`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${app} did not start`);
}
async function attach(
  context: BrowserContext,
  scope: string,
  port: number,
  host = demoHost,
) {
  const base = auditUrls[scope] || `http://${host}:${port}`;
  host = new URL(base).hostname;
  const prefix = new URL(base).pathname.replace(/\/$/, "");
  const apiPath = (url: URL) => url.pathname.startsWith(prefix + "/api/")
    ? url.pathname.slice(prefix.length) : url.pathname;
  const user = {
    id: adminId,
    email: "qa@example.test",
    role: "authenticated",
    aud: "authenticated",
    user_metadata: { role: "admin" },
    app_metadata: { provider: "email" },
    created_at: new Date().toISOString(),
  };
  const session = {
    access_token: "isolated-browser-fixture",
    refresh_token: "fixture",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
  await context.addCookies([
    {
      name: `sb-${scope}-auth-token`,
      value: encodeURIComponent(JSON.stringify(session)),
      domain: host,
      path: "/",
    },
  ]);
  // Register the catch-all first: later fixtures handle known APIs. An unknown
  // operation fails locally instead of sending a synthetic mutation upstream.
  await context.route(
    (url) => url.hostname === host && apiPath(url).startsWith("/api/"),
    (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Unsupported isolated fixture API" },
      }),
  );
  // These local API calls are intercepted before the Next server can contact hosted Supabase.
  await context.route(
    (url) =>
      url.hostname === host &&
      /^\/api\/(orders\/(checkout|create|action|pickup|quote)|account\/lookup)$/.test(
        apiPath(url),
      ),
    async (route) => {
      const request = route.request(),
        body = request.postDataJSON(),
        name = new URL(request.url()).pathname.split("/").at(-1);
      try {
        let result: unknown;
        if (name === "lookup") {
          result = {
            customer: {
              id: "10000000-0000-4000-8000-000000000002",
              full_name: "Jordan Reyes",
              email: "loyalty@example.test",
              points: 100,
            },
          };
        } else if (name === "action")
          result = (
            await db.query<{ result: unknown }>(
              "SELECT pos_order_action($1,$2,$3,$4) result",
              [
                adminId,
                body.order_id,
                body.action,
                body.expected_status ?? null,
              ],
            )
          ).rows[0].result;
        else if (name === "pickup")
          result = (
            await db.query<{ result: unknown }>(
              "SELECT pos_pickup($1,$2) result",
              [adminId, body.qr],
            )
          ).rows[0].result;
        else {
          const identity = submissionIdentity(
            new Request(request.url(), { headers: request.headers() }),
            name === "checkout" ? "pos-cash" : "pos",
            adminId,
            body,
          );
          const prior =
            name === "checkout"
              ? (
                  await db.query<{ result: unknown }>(
                    "SELECT result FROM pos_checkout_attempts WHERE key=$1",
                    [identity.key],
                  )
                ).rows[0]
              : null;
          if (prior) result = prior.result;
          else {
            const catalog = (
              await db.query<Record<string, unknown>>(
                "SELECT * FROM menu_items",
              )
            ).rows;
            for (const item of catalog)
              item.variants = (
                await db.query(
                  "SELECT * FROM item_variants WHERE menu_item_id=$1",
                  [item.id],
                )
              ).rows;
            const client = {
              from: () => ({
                select: () => ({
                  in: async () => ({ data: restNumbers(catalog), error: null }),
                }),
              }),
            };
            const items = body.items
              ? await priceCatalogItems(
                  client as unknown as Parameters<typeof priceCatalogItems>[0],
                  body.items as SubmittedItem[],
                  "base",
                )
              : null;
            const subtotal = items?.reduce((n, i) => n + i.subtotal, 0) ?? 0,
              points = body.parked ? 0 : (body.points_redeemed ?? 0);
            const order = items
              ? {
                  order_source: "pos",
                  order_type: "pickup",
                  payment_method: "cash",
                  customer_id: body.customer_id ?? null,
                  points_redeemed: points,
                  subtotal,
                  discount: points / 10,
                  total: subtotal - points / 10,
                  notes: body.notes ?? null,
                  is_parked: body.parked ?? false,
                }
              : null;
            if (name === "quote") {
              if (items) {
                await db.query("SELECT finance_check_quote($1)", [JSON.stringify(items)]);
                const breakdown = (await db.query<{ value: Record<string,unknown> }>("SELECT finance_standard_snapshot(jsonb_populate_record(NULL::orders,$1),$2) value",[JSON.stringify(order),JSON.stringify(items)])).rows[0].value;
                result={version:1,currency:"PHP",total:breakdown.total,breakdown,quotedAt:new Date().toISOString()};
              } else {
                const quoted=(await db.query<{ value: { total:number; breakdown:unknown } }>("SELECT finance_unpaid_quote($1) value",[body.order_id])).rows[0].value;
                result={version:1,currency:"PHP",total:Math.round(Number(quoted.total)*100),breakdown:quoted.breakdown,quotedAt:new Date().toISOString()};
              }
            } else result =
              name === "checkout"
                ? (
                    await db.query<{ result: unknown }>(
                      body.pickup_qr
                        ? "SELECT pos_cash_pickup($1,$2,$3,$4,$5,$6) result"
                        : "SELECT pos_cash_checkout($1,$2,$3,$4,$5,$6,$7,$8) result",
                      body.pickup_qr
                        ? [
                            adminId,
                            identity.key,
                            identity.fingerprint,
                            body.pickup_qr,
                            body.cash_received,
                            body.expected_total,
                          ]
                        : [
                            adminId,
                            identity.key,
                            identity.fingerprint,
                            body.cash_received,
                            body.expected_total,
                            order ? JSON.stringify(order) : null,
                            items ? JSON.stringify(items) : null,
                            body.order_id ?? body.parked_order_id ?? null,
                          ],
                    )
                  ).rows[0].result
                : (
                    await db.query<{ result: unknown }>(
                      "SELECT pos_save_parked($1,$2,$3,$4,$5,$6) result",
                      [
                        adminId,
                        JSON.stringify(order),
                        JSON.stringify(items),
                        identity.key,
                        identity.fingerprint,
                        body.parked_order_id ?? null,
                      ],
                    )
                  ).rows[0].result;
          }
        }
        if (name === "create" && loseNextPark) {
          loseNextPark = false;
          await route.abort("failed");
          publishOrders();
          return;
        }
        if (name === "checkout") {
          checkoutRequests++;
          if (loseNextCheckout) {
            loseNextCheckout = false;
            await route.abort("failed");
            publishOrders();
            return;
          }
        }
        await route.fulfill({ json: restNumbers(result) });
        publishOrders();
      } catch (error) {
        await route.fulfill({
          status: 409,
          json: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    },
  );
  await context.routeWebSocket(/supabase\.co\/realtime/, (socket) => {
    socket.onMessage((message) => {
      const raw = JSON.parse(String(message));
      const array = Array.isArray(raw);
      const m = array
        ? { topic: raw[2], event: raw[3], ref: raw[1], payload: raw[4] }
        : raw;
      const reply = (payload: unknown) =>
        socket.send(
          JSON.stringify(
            array
              ? [raw[0], m.ref, m.topic, "phx_reply", payload]
              : { topic: m.topic, event: "phx_reply", ref: m.ref, payload },
          ),
        );
      if (m.event === "phx_join") {
        const changes = (m.payload.config?.postgres_changes ?? []).map(
          (c: { table: string; schema: string; event: string }, n: number) => ({
            ...c,
            id: n + 1,
          }),
        );
        reply({ status: "ok", response: { postgres_changes: changes } });
        changes.forEach((c: { table: string; id: number }) =>
          sockets.push({
            socket,
            topic: m.topic,
            table: c.table,
            id: c.id,
            array,
          }),
        );
      } else reply({ status: "ok", response: {} });
    });
  });
  await context.route(
    (url) => url.hostname === host && apiPath(url) === "/api/orders/delivery",
    async (route) => {
      const { order_id: id, action } = route.request().postDataJSON();
      const order = (
        await db.query<{
          order_type: string;
          payment_status: string;
          status: string;
          lalamove_order_id: string | null;
        }>(
          "SELECT order_type,payment_status,status,lalamove_order_id FROM orders WHERE id=$1",
          [id],
        )
      ).rows[0];
      if (
        !order ||
        order.order_type !== "delivery" ||
        order.payment_status !== "paid"
      )
        return route.fulfill({
          status: 409,
          json: { error: "Use a paid delivery order" },
        });
      if (action === "dispatch") {
        await db.query(
          "UPDATE orders SET lalamove_order_id=COALESCE(lalamove_order_id,'1234567890123456789'),lalamove_status=COALESCE(lalamove_status,'ASSIGNING_DRIVER'),lalamove_share_link='https://share.sandbox.lalamove.com/fixture' WHERE id=$1",
          [id],
        );
        publishOrders();
        return route.fulfill({
          json: { success: true, lalamoveOrderId: "1234567890123456789" },
        });
      }
      const data = (
        await db.query<{ lalamove_status: string }>(
          "SELECT lalamove_status FROM orders WHERE id=$1",
          [id],
        )
      ).rows[0];
      return route.fulfill({
        json: {
          status: data.lalamove_status,
          shareLink: "https://share.sandbox.lalamove.com/fixture",
          driver:
            data.lalamove_status === "PICKED_UP"
              ? {
                  name: "Fixture rider",
                  phone: "+639900100900",
                  plateNumber: "QA-123",
                }
              : null,
        },
      });
    },
  );
  await context.route(
    (url) => url.hostname === host && apiPath(url) === "/api/orders/queue",
    async (route) => {
      const { queue = "active", page = 0 } = route.request().postDataJSON();
      const where =
        queue === "parked"
          ? "is_parked"
          : queue === "future"
            ? "NOT is_parked AND payment_status='paid' AND status IN('pending','confirmed') AND preparation_due_at>now()"
            : "NOT is_parked AND (pickup_window_start IS NULL OR preparation_due_at<=now() OR payment_status<>'paid' OR status IN('preparing','ready'))";
      const filter =
        "status IN('pending','confirmed','preparing','ready') AND (" +
        where +
        ")";
      const rows = (
        await db.query(
          "SELECT o.*,(SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) FROM order_items i WHERE i.order_id=o.id) items FROM orders o WHERE " +
            filter +
            " ORDER BY created_at,id LIMIT 50 OFFSET $1",
          [Number(page) * 50],
        )
      ).rows;
      const total = Number(
        (
          await db.query<{ count: string }>(
            "SELECT count(*) FROM orders WHERE " + filter,
          )
        ).rows[0].count,
      );
      await route.fulfill({
        json: restNumbers({
          orders: rows,
          total,
          page,
          server_now: new Date().toISOString(),
        }),
      });
    },
  );
  if (scope === "customer")
    await context.route(
      (url) =>
        url.hostname === host &&
        /^\/api\/(branch|customer\/.*|pickup\/.*)$/.test(apiPath(url)),
      (route) => {
        const pathname = new URL(route.request().url()).pathname;
        return route.fulfill({
          json:
            pathname === "/api/branch"
              ? {
                  name: "Jayds Café",
                  address: "Isolated branch",
                  latitude: 14.346621,
                  longitude: 120.981057,
                  delivery_radius_km: 8,
                  version: "fixture",
                  scheduled_pickup_enabled: false,
                }
              : pathname.includes("favorites")
                ? { items: [] }
                : pathname.includes("push")
                  ? { configured: false }
                  : { acknowledged: false },
        });
      },
    );
  await context.route(/https:\/\/[^/]+\.supabase\.co\/.*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    try {
      if (request.method() === "OPTIONS") {
        await route.fulfill({
          status: 200,
          headers: { "access-control-allow-origin": "*" },
        });
        return;
      }
      if (url.pathname.startsWith("/auth/")) {
        await route.fulfill({ json: { user, ...user } });
        return;
      }
      const name = url.pathname.split("/").at(-1)!;
      if (url.pathname.includes("/rpc/")) {
        if (failNextSave && name === "inv_save_menu") {
          failNextSave = false;
          await route.fulfill({
            status: 409,
            json: {
              message: "Simulated save failure; your entries are retained.",
              code: "P0001",
            },
          });
          return;
        }
        const args = request.postDataJSON() as Record<string, unknown>;
        const meta = (
          await db.query<{ proargnames: string[] }>(
            "SELECT proargnames FROM pg_proc WHERE proname=$1",
            [name],
          )
        ).rows[0];
        if (!meta) throw new Error("Unknown fixture RPC " + name);
        const keys = (meta.proargnames ?? []).filter((k) =>
          Object.hasOwn(args, k),
        );
        const query = `SELECT public.${name}(${keys.map((k, i) => `${k}=>$${i + 1}`).join(",")}) value`;
        const value = (
          await db.query<{ value: unknown }>(
            query,
            keys.map((k) =>
              typeof args[k] === "object" && args[k] !== null && !(name === "admin_export_create" && k === "p_tables")
                ? JSON.stringify(args[k])
                : args[k],
            ),
          )
        ).rows[0]?.value;
        if (
          scope === "pos" &&
          name === "get_configuration_availability" &&
          heldAvailability
        ) {
          const held = heldAvailability;
          held.started();
          await held.released;
        }
        await route.fulfill({ json: value ?? null });
        if (name.startsWith("inv_")) publishCatalog();
        return;
      }
      assert.match(name, /^[a-z_]+$/);
      let data: Record<string, unknown>[];
      if (name === "profiles")
        data = [
          {
            id: adminId,
            full_name: "Alex Santos",
            email: user.email,
            role: "admin",
            is_approved: true,
            points: 100,
          },
        ];
      else {
        const filters = [...url.searchParams].filter(
          ([k, v]) =>
            k !== "select" &&
            /^(eq|neq|ilike|in)\./.test(v) &&
            /^[a-z_]+$/.test(k),
        );
        const where = filters.length
          ? " WHERE " +
            filters
              .map(([k, v], i) =>
                v.startsWith("in.(")
                  ? `${k}::text=ANY($${i + 1}::text[])`
                  : v.startsWith("neq.") ? `${k}<>$${i + 1}`
                  : v.startsWith("ilike.") ? `${k} ILIKE $${i + 1}` : `${k}=$${i + 1}`,
              )
              .join(" AND ")
          : "";
        const filterValues = filters.map(([, v]) => v.startsWith("in.(") ? v.slice(4, -1).split(",") : v.slice(v.indexOf(".") + 1));
        if (request.method() === "DELETE") {
          assert.ok(filters.length, "Destructive fixture requests require an explicit filter");
          data = (await db.query<Record<string, unknown>>(`DELETE FROM ${name}${where} RETURNING *`, filterValues)).rows;
        } else if (!["GET", "HEAD"].includes(request.method())) {
          const body = request.postDataJSON() as Record<string, unknown>;
          const entries = Object.entries(body);
          const sql =
            request.method() === "POST"
              ? `INSERT INTO ${name}(${entries.map(([k]) => k).join(",")}) VALUES(${entries.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING *`
              : `UPDATE ${name} SET ${entries.map(([k], i) => `${k}=$${i + 1}`).join(",")}${filters.length ? " WHERE " + filters.map(([k], i) => `${k}=$${i + 1 + entries.length}`).join(" AND ") : ""} RETURNING *`;
          data = (
            await db.query<Record<string, unknown>>(sql, [
              ...entries.map(([, v]) =>
                typeof v === "object" && v !== null ? JSON.stringify(v) : v,
              ),
              ...(request.method() === "POST"
                ? []
                : filterValues),
            ])
          ).rows;
        } else
          data = (
            await db.query<Record<string, unknown>>(
              `SELECT * FROM ${name}${where}`,
              filterValues,
            )
          ).rows;
        if (name === "menu_item_ingredients" && url.searchParams.get('select')?.includes('ingredient:'))
          for(const requirement of data) requirement.ingredient=(await db.query('SELECT name,cost_per_unit,unit FROM ingredients WHERE id=$1',[requirement.ingredient_id])).rows[0];
        if (name === "menu_items")
          for (const item of data) {
            item.variants = (
              await db.query(
                "SELECT * FROM item_variants WHERE menu_item_id=$1",
                [item.id],
              )
            ).rows;
            item.category = (
              await db.query("SELECT * FROM categories WHERE id=$1", [
                item.category_id,
              ])
            ).rows[0];
          }
        if (name === "purchase_orders")
          for (const po of data) {
            po.supplier = (
              await db.query("SELECT * FROM suppliers WHERE id=$1", [
                po.supplier_id,
              ])
            ).rows[0];
            po.lines = (
              await db.query(
                "SELECT * FROM purchase_order_lines WHERE purchase_order_id=$1",
                [po.id],
              )
            ).rows;
          }
        if (name === "orders")
          for (const o of data) {
            o.items = (
              await db.query("SELECT * FROM order_items WHERE order_id=$1", [
                o.id,
              ])
            ).rows;
            o.customer = null;
          }
      }
      if (request.method() === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": `0-${Math.max(0, data.length - 1)}/${data.length}`, "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" }, body: "" });
      await route.fulfill({
        json: restNumbers(
          request.headers().accept?.includes("object+json")
            ? (data[0] ?? null)
            : data,
        ),
      });
    } catch (error) {
      console.log(
        "Fixture request error:",
        url.pathname,
        error instanceof Error ? error.message : String(error),
      );
      await route.fulfill({
        status: 400,
        json: {
          code: "P0001",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
  // No test token, credentials, or mutations can reach another external service.
  await context.route(
    (url) =>
      url.protocol === "https:" && url.origin !== new URL(base).origin && !url.hostname.endsWith(".supabase.co"),
    (route) => route.abort(),
  );
  return base;
}
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-fake-device-for-media-stream"],
});
try {
  await db.exec(readFileSync("tests/fixtures/inventory-base.sql", "utf8"));
  await db.exec("ALTER TABLE orders ADD COLUMN payment_review_required boolean NOT NULL DEFAULT false");
  await db.exec(
    "ALTER TABLE profiles ADD COLUMN is_approved boolean DEFAULT true, ADD COLUMN full_name text; CREATE TABLE pickup_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),token_hash text UNIQUE,is_used boolean DEFAULT false); CREATE TABLE guest_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),receipt_token text UNIQUE,receipt_data jsonb,created_at timestamptz DEFAULT now(),expires_at timestamptz DEFAULT now()+interval '30 days'); ALTER TABLE guest_receipts ENABLE ROW LEVEL SECURITY; CREATE POLICY guest_receipts_public_read ON guest_receipts FOR SELECT USING(true);",
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20260426001600_run10_void_pin.sql",
      "utf8",
    ),
  );
  await db.exec(
    "SELECT set_config('request.jwt.claim.role','service_role',false)",
  );
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
    adminId,
  ]);
  await db.query(
    "INSERT INTO profiles(id,role,points) VALUES($1,'admin',100)",
    [adminId],
  );
  await db.query(
    "INSERT INTO profiles(id,role,points) VALUES('10000000-0000-4000-8000-000000000002','customer',100)",
  );
  const category = (
    await db.query<{ id: string }>(
      "INSERT INTO categories(name) VALUES('Espresso') RETURNING id",
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO ingredients(id,name,current_stock,min_stock_alert) VALUES($1,'House espresso beans',1200,150)",
    [stockId],
  );
  await db.query(
    "INSERT INTO menu_items(id,name,description,price,category_id,tags) VALUES($1,'Spanish Latte','Our signature espresso, silky milk, and a little sweetness.',145,$2,ARRAY['coffee'])",
    [itemId, category],
  );
  await db.query(
    "INSERT INTO menu_item_ingredients(menu_item_id,ingredient_id,quantity_used,size_multipliers) VALUES($1,$2,18,'{\"Large\":1.5}')",
    [itemId, stockId],
  );
  await db.query(
    "INSERT INTO item_variants(menu_item_id,variant_group,label,is_default) VALUES($1,'size','Regular',true),($1,'size','Large',false)",
    [itemId],
  );
  for (const file of [
    "20261002000100_inventory_operations.sql",
    "20261002000200_atomic_orders_forecasts.sql",
    "20261002000300_operations_overview.sql",
    "20261002000400_pos_cashier.sql",
    "20261002000600_inventory_readiness.sql",
    "20261007000400_distinguish_delivery_pickup.sql",
    "20261007000500_guest_pickup_qr.sql",
    "20261007000600_cash_at_pickup.sql",
    "20261013000400_finance_invoices.sql",
    "20261016000100_stock_planning_details.sql",
    "20261016000300_admin_exports.sql",
    "20261016000400_admin_sales_reports.sql",
    "20261016000500_finance_quotes.sql",
    "20261016000600_finance_documents.sql",
    "20261016000700_purchase_vat.sql",
    "20261016000800_export_file_privacy.sql",
  ])
    {
      if (file === "20261016000600_finance_documents.sql") await db.exec("CREATE SCHEMA IF NOT EXISTS storage; CREATE TABLE IF NOT EXISTS storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[])");
      await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    }
  await db.query("UPDATE inventory_settings SET enforcement_enabled=true");
  await db.exec(
    "ALTER TABLE orders ADD COLUMN pickup_window_start timestamptz, ADD COLUMN preparation_due_at timestamptz, ADD COLUMN lalamove_order_id text, ADD COLUMN lalamove_status text, ADD COLUMN lalamove_share_link text",
  );
  const supplier = (
    await db.query<{ id: string }>(
      "INSERT INTO suppliers(name,contact_name,email) VALUES('Benguet Coffee Co.','Mika Reyes','supply@example.test') RETURNING id",
    )
  ).rows[0].id;
  await db.query("UPDATE ingredients SET supplier_id=$1,pack_size=1000", [
    supplier,
  ]);
  await db.query(
    "SELECT inv_save_po(NULL,$1,inv_business_date()+3,'Weekly replenishment',$2)",
    [
      supplier,
      JSON.stringify([
        { ingredient_id: stockId, quantity: 2000, unit_cost: 0.75 },
      ]),
    ],
  );
  await Promise.all([
    start("admin", ports.admin),
    start("pos", ports.pos),
    start("customer", ports.customer),
  ]);
  if(process.env.JAYDS_LOADING_ONLY !== "1" && process.env.JAYDS_UX_ONLY !== "1" && process.env.JAYDS_REPORTS_ONLY !== "1") await passwordJourneys(browser,{customer:auditUrls.customer || `http://${demoHost}:${ports.customer}`,pos:auditUrls.pos || `http://${demoHost}:${ports.pos}`,admin:auditUrls.admin || `http://${demoHost}:${ports.admin}`});
  if(process.env.JAYDS_LOADING_ONLY === "1" || process.env.JAYDS_UX_ONLY === "1") {
    const auditContext=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:"block"});
    const auditBase=await attach(auditContext,"admin",ports.admin);
    try {const auditPage=await auditContext.newPage();if(process.env.JAYDS_LOADING_ONLY === "1")await adminLoadingJourneys({page:auditPage,base:auditBase});else await adminUxJourneys({page:auditPage,base:auditBase,db,stockId,itemId,actor:adminId});}
    finally{await auditContext.close();}
  } else if(process.env.JAYDS_REPORTS_ONLY === "1") {
    const reportsContext=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:"block",timezoneId:"America/Los_Angeles"});
    const reportsBase=await attach(reportsContext,"admin",ports.admin);
    try{await adminSalesJourneys({page:await reportsContext.newPage(),base:reportsBase,db,itemId});}finally{await reportsContext.close();}
  } else if (process.env.JAYDS_PASSWORD_ONLY === "1") {
    console.log("Password-only browser audit complete.");
  } else if(process.env.JAYDS_FINANCE_ONLY === "1") {
    const financeContext=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:"block"});
    const financeBase=await attach(financeContext,"admin",ports.admin);
    try {await financeJourneys({page:await financeContext.newPage(),base:financeBase,customerBase:auditUrls.customer || `http://${demoHost}:${ports.customer}`,db,actor:adminId,item:itemId});}
    finally {await financeContext.close();}
  } else if (process.env.JAYDS_ADMIN_COMPLETE_ONLY === "1") {
    const deepContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
    const deepBase = await attach(deepContext, "admin", ports.admin);
    try {
      const completed = await completeAdminJourneys({ page: await deepContext.newPage(), base: deepBase, db, stockId, actor: adminId });
      if (completed.some(row => row.status === "FAIL")) process.exitCode = 1;
    } finally { await deepContext.close(); }
  } else if (process.env.JAYDS_SCANNER_ONLY === "1") {
    const scanContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", permissions: ["camera"] });
    const scanBase = await attach(scanContext, "pos", ports.pos);
    try {
      const results = await scannerAudit(await scanContext.newPage(), scanBase);
      if (results.some(row => row.status === "FAIL")) process.exitCode = 1;
    } finally { await scanContext.close(); }
  } else {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  const base = await attach(context, "admin", ports.admin);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("Browser error:", e.message);
  });
  await page.goto(base + "/dashboard");
  await page
    .getByRole("heading", { name: "Café overview" })
    .waitFor({ timeout: 30000 });
  await page.getByText("₱1,200.00", { exact: true }).waitFor();
  for (const [width, height, label] of [
    [1440, 1000, "desktop"],
    [834, 1112, "tablet"],
    [390, 844, "phone"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: path.join(output, `overview-${label}.png`),
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      `Overview overflows at ${width}`,
    );
    if (label === "phone") {
      const navigation = page.getByLabel("Admin navigation");
      assert.equal(
        await navigation.isVisible(),
        false,
        "Closed navigation stays outside keyboard focus",
      );
      await page.getByRole("button", { name: "Open navigation" }).click();
      await navigation.waitFor({ state: "visible" });
      await page.keyboard.press("Tab");
      assert.ok(
        await page.evaluate(() => !!document.activeElement?.closest("aside")),
      );
      await page.keyboard.press("Escape");
      await navigation.waitFor({ state: "hidden" });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Customer care must distinguish an unavailable recovery feed from an empty
  // one, retain the last confirmed data, and keep an unsaved private reply.
  let operationsUnavailable = true;
  let replySaveFails = true;
  const supportCase = {
    id: "60000000-0000-4000-8000-000000000001",
    kind: "refund",
    subject: "Isolated receipt question",
    message: "Please review my order receipt.",
    response: null as string | null,
    status: "open",
    order_id: null,
    created_at: new Date().toISOString(),
  };
  await context.route(/\/rest\/v1\/customer_support_cases(?:\?|$)/, (route) =>
    route.fulfill({ json: [supportCase] }),
  );
  await context.route(
    (url) =>
      url.pathname === "/rest/v1/orders" &&
      url.searchParams.get("payment_review_required") === "eq.true",
    (route) =>
      route.fulfill({
        json: [
          {
            id: "70000000-0000-4000-8000-000000000001",
            order_number: "ORD-10123",
            status: "cancelled",
            payment_status: "paid",
            total: 145,
            payment_review_reason: "Payment received after cancellation",
          },
        ],
      }),
  );
  await context.route(/\/rest\/v1\/rpc\/get_customer_operations$/, (route) =>
    operationsUnavailable
      ? route.fulfill({
          status: 503,
          json: { message: "Isolated recovery outage" },
        })
      : route.fulfill({ json: { attempts: [], failed_push: 3 } }),
  );
  await context.route(
    /\/rest\/v1\/rpc\/customer_support_update$/,
    async (route) => {
      if (replySaveFails) {
        replySaveFails = false;
        return route.fulfill({
          status: 503,
          json: { message: "Isolated reply outage" },
        });
      }
      const body = route.request().postDataJSON();
      supportCase.response = body.p_response;
      supportCase.status = body.p_status;
      await route.fulfill({ json: null });
    },
  );
  await page.goto(base + "/customer-care");
  await page.getByRole("button",{name:/Payments & delivery/}).click();
  await page.locator("main").getByText(/Provider recovery is unavailable/).waitFor();
  assert.equal(
    await page.getByText("No uncertain provider attempts to review.").count(),
    0,
  );
  operationsUnavailable = false;
  await page.getByRole("button", { name: "Retry operations" }).click();
  await page.getByText("No uncertain provider attempts to review.").waitFor();
  await page.getByText("Failed notification deliveries: 3").waitFor();
  await page.getByRole("link", { name: /ORD-10123/ }).waitFor();
  operationsUnavailable = true;
  await page.getByRole("button", { name: "Refresh operations" }).click();
  await page.locator("main").getByText(/Showing the last loaded references/).waitFor();
  await page.locator("main").getByText(/Showing the last loaded review list/).waitFor();
  await page.getByRole("link", { name: /ORD-10123/ }).waitFor();
  await page.getByText("Failed notification deliveries: 3").waitFor();
  assert.equal(
    await page.getByText("No uncertain provider attempts to review.").count(),
    0,
  );
  await page.getByRole("button",{name:/Private requests/}).click();
  await page.getByRole("button", { name: /Isolated receipt question/ }).click();
  await page
    .getByLabel("Private reply")
    .fill("The receipt review is in progress.");
  await page.getByRole("button", { name: "Save review" }).click();
  await page.locator("main").getByText(/The response could not save/).waitFor();
  assert.equal(
    await page.getByLabel("Private reply").inputValue(),
    "The receipt review is in progress.",
  );
  await page.getByRole("button", { name: "Save review" }).click();
  await page.getByLabel("Private reply").waitFor({ state: "hidden" });
  assert.equal(supportCase.response, "The receipt review is in progress.");
  await page.goto(base + "/inventory");
  await page
    .getByRole("heading", { name: "Stock & recipes", exact: true })
    .waitFor();
  await page
    .getByText("House espresso beans", { exact: true })
    .first()
    .waitFor();
  await db.exec("UPDATE inventory_settings SET enforcement_enabled=false");
  await page.goto(base + "/inventory?setup=1");
  const setupDrawer = page.getByRole("dialog", { name: "Stock enforcement" });
  await setupDrawer.waitFor();
  await setupDrawer
    .getByRole("region", { name: "Inventory activation checklist" })
    .getByText("Opening stock counts", { exact: true })
    .waitFor();
  assert.equal(
    await setupDrawer
      .getByRole("button", { name: "Activate inventory checks" })
      .isDisabled(),
    true,
    "Missing posted counts must block activation before submitting a mutation",
  );
  await page.keyboard.press("Escape");
  await db.exec("UPDATE inventory_settings SET enforcement_enabled=true");
  await page.goto(base + "/inventory");
  await page.getByRole("tab", { name: /Stock items/ }).waitFor();
  for (const [width, height, label] of [
    [1440, 1000, "desktop"],
    [834, 1112, "tablet"],
    [390, 844, "phone"],
  ] as const) {
    await page.setViewportSize({ width, height });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      `Inventory overflows at ${width}`,
    );
    await page.screenshot({
      path: path.join(output, `inventory-${label}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/orders?filter=stock_conflict");
  await page.waitForFunction(
    () =>
      (
        document.querySelector(
          'input[type="checkbox"]',
        ) as HTMLInputElement | null
      )?.checked,
  );
  assert.equal(
    await page.getByLabel("Stock needs attention").isChecked(),
    true,
  );
  await page.goto(base + "/menu");
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  const drawer = page.getByRole("dialog");
  await drawer.getByLabel("Product name").fill("Spanish Latte — revised");
  failNextSave = true;
  await drawer.getByRole("button", { name: "Save product" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Save product", exact: true })
    .click();
  await drawer.getByRole("alert").waitFor();
  assert.equal(
    await drawer.getByLabel("Product name").inputValue(),
    "Spanish Latte — revised",
  );
  await page.keyboard.press("Tab");
  assert.ok(
    await page.evaluate(
      () => !!document.activeElement?.closest('[role="dialog"]'),
    ),
    "Focus must stay in the drawer",
  );
  await drawer.getByRole("button", { name: "Save product" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Save product", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      !document.querySelector('[role="dialog"]') ||
      [...document.querySelectorAll('[role="alert"]')].some(
        (n) =>
          n.textContent && !n.textContent.includes("Simulated save failure"),
      ),
  );
  if (await drawer.isVisible())
    throw new Error(
      (await drawer.getByRole("alert").textContent()) ??
        "Save did not complete",
    );
  await page.goto(base + "/purchasing");
  await page
    .getByRole("heading", { name: "Buy & receive stock", exact: true })
    .first()
    .waitFor();
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(output, "purchasing-review.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Review", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Approve purchase" }).click();
  await page.getByRole("button", { name: "Confirm approved" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("approved", { exact: true }).first().waitFor();
  assert.equal(
    Number(
      (
        await db.query<{ current_stock: string }>(
          "SELECT current_stock FROM ingredients WHERE id=$1",
          [stockId],
        )
      ).rows[0].current_stock,
    ),
    1200,
  );
  await page
    .getByRole("button", { name: "Review", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Confirm ordered", exact: true })
    .click();
  await page
    .getByText("Confirm that this order was sent to the supplier?")
    .waitFor();
  await page
    .getByRole("button", { name: "Confirm ordered", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Receive", exact: true })
    .first()
    .click();
  await page.getByLabel("Delivery / invoice reference").fill("QA delivery");
  await page.getByLabel("Actual quantity (g)").fill("500");
  await page.getByRole("button", { name: "Confirm physical receipt" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirm goods received" })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    Number(
      (
        await db.query<{ current_stock: string }>(
          "SELECT current_stock FROM ingredients WHERE id=$1",
          [stockId],
        )
      ).rows[0].current_stock,
    ),
    1700,
  );
  await page.screenshot({
    path: path.join(output, "purchasing-desktop.png"),
    fullPage: true,
  });
  for (const route of [
    "/inventory?tab=forecasts",
    "/inventory?tab=waste",
    "/inventory?tab=stocktakes",
    "/audit",
  ]) {
    await page.goto(base + route);
    await page.waitForLoadState("domcontentloaded");
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  await context.close();
  const posContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: "block",
  });
  const posBase = await attach(posContext, "pos", ports.pos);
  const posPage = await posContext.newPage();
  posPage.on("pageerror", (e) => errors.push(e.message));
  await posPage.goto(posBase + "/new-order");
  await posPage
    .getByRole("button", { name: /Options for Spanish Latte/ })
    .first()
    .click();
  const posLarge = posPage.getByRole("button", { name: /^Large/ });
  await posLarge.waitFor();
  const customerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const customerBase = await attach(
    customerContext,
    "customer",
    ports.customer,
  );
  const customerPage = await customerContext.newPage();
  customerPage.on("pageerror", (e) => errors.push(e.message));
  await customerPage.goto(customerBase + "/menu/browse/" + itemId);
  const customerLarge = customerPage.getByRole("button", {
    name: "Large",
    exact: true,
  });
  await customerLarge.waitFor({ timeout: 30000 });
  assert.equal(await posLarge.isDisabled(), false);
  assert.equal(await customerLarge.isDisabled(), false);
  await posPage.screenshot({
    path: path.join(output, "pos-availability.png"),
    fullPage: true,
  });
  await customerPage.screenshot({
    path: path.join(output, "mobile-availability.png"),
    fullPage: true,
  });
  await db.query(
    "SELECT inv_post_movement($1,1680,'waste','Availability propagation fixture')",
    [stockId],
  );
  const started = Date.now();
  publishCatalog();
  await Promise.all([
    posLarge.waitFor({ state: "visible" }),
    customerLarge.waitFor({ state: "visible" }),
  ]);
  await Promise.all([
    posPage.waitForFunction(
      () =>
        [...document.querySelectorAll("button")].some(
          (b) => b.textContent?.trim().startsWith("Large") && b.disabled,
        ),
      {},
      { timeout: 5000 },
    ),
    customerPage.waitForFunction(
      () =>
        [...document.querySelectorAll("button")].some(
          (b) => b.textContent?.trim().startsWith("Large") && b.disabled,
        ),
      {},
      { timeout: 5000 },
    ),
  ]);
  assert.ok(
    Date.now() - started < 5000,
    "Both clients must refresh after a catalog event within five seconds",
  );
  await customerContext.setOffline(true);
  await customerPage.evaluate(() => window.dispatchEvent(new Event("offline")));
  await db.query(
    "SELECT inv_post_movement($1,30,'receipt','Restock while client was disconnected')",
    [stockId],
  );
  await customerContext.setOffline(false);
  await customerPage.waitForLoadState("networkidle");
  await customerPage.evaluate(() => window.dispatchEvent(new Event("online")));
  await customerPage.waitForFunction(
    () =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent?.trim().startsWith("Large") && !b.disabled,
      ),
    {},
    { timeout: 15000 },
  );
  assert.equal(await customerLarge.isDisabled(), false);
  await posPage.getByLabel("Close dialog").click();
  await cashierJourneys({
    db,
    page: posPage,
    context: posContext,
    base: posBase,
    itemId,
    stockId,
    actor: adminId,
    output,
    publishCatalog,
    publishOrders,
    holdAvailabilityRefresh,
    loseResponse: () => {
      loseNextCheckout = true;
    },
    loseParkResponse: () => {
      loseNextPark = true;
    },
  }).catch(async (failure) => {
    await posPage.screenshot({ path: path.join(output, "pos-failure.png") });
    console.log(
      "POS failure context:",
      posPage.url(),
      await posPage.evaluate(() =>
        document.activeElement?.outerHTML.slice(0, 500),
      ),
      errors,
    );
    throw failure;
  });
  assert.equal(
    checkoutRequests,
    3,
    "Register lost-response retry plus one mobile cash handover; canonical receipt recovery creates no extra payment request",
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  const cameraContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
    permissions: ["camera"],
  });
  const cameraBase = await attach(cameraContext, "pos", ports.pos, "127.0.0.1");
  await cameraContext.addInitScript(() => {
    const state = Object.assign(window, {
      __qaCameraTracks: [] as MediaStreamTrack[],
      __qaCameraStarts: 0,
    });
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      state.__qaCameraStarts++;
      const stream = await original(constraints);
      state.__qaCameraTracks.push(...stream.getTracks());
      return stream;
    };
  });
  const cameraPage = await cameraContext.newPage();
  cameraPage.on("pageerror", (error) => errors.push(error.message));
  await cameraPage.goto(cameraBase + "/dashboard");
  await cameraPage
    .getByRole("button", { name: "Scan pickup", exact: true })
    .first()
    .click();
  await cameraPage
    .getByRole("dialog", { name: "Scan pickup QR", exact: true })
    .waitFor();
  await cameraPage.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>(".pos-dialog video");
    return video && video.videoHeight > 0 && video.currentTime > 0;
  });
  assert.equal(
    await cameraPage.getByLabel("Pickup QR code").count(),
    0,
    "First click starts webcam before code entry",
  );
  await cameraPage.screenshot({
    path: path.join(output, "pos-pickup-webcam.png"),
  });
  await cameraPage
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await cameraPage.waitForFunction(() => {
    const state = window as unknown as {
      __qaCameraTracks: MediaStreamTrack[];
      __qaCameraStarts: number;
    };
    return (
      state.__qaCameraStarts > 0 &&
      state.__qaCameraTracks.length > 0 &&
      state.__qaCameraTracks.every((track) => track.readyState === "ended")
    );
  });
  await cameraPage.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied by fixture", "NotAllowedError");
    };
  });
  await cameraPage
    .getByRole("button", { name: "Scan pickup", exact: true })
    .first()
    .click();
  await cameraPage
    .getByRole("alert")
    .filter({ hasText: "Camera permission was denied" })
    .waitFor();
  await cameraPage
    .getByRole("button", { name: "Enter code instead", exact: true })
    .click();
  await cameraPage.getByLabel("Pickup QR code").waitFor();
  await cameraPage.getByLabel("Close dialog").click();
  if (process.env.JAYDS_SYSTEM_AUDIT === "1") {
    const scanResults = await scannerAudit(cameraPage, cameraBase);
    if (scanResults.some(row => row.status === "FAIL")) process.exitCode = 1;
  }
  await cameraContext.close();
  const financeContext=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:"block"});
  const financeBase=await attach(financeContext,"admin",ports.admin);
  const financePage=await financeContext.newPage();
  financePage.on("pageerror",error=>errors.push(error.message));
  try {await financeJourneys({page:financePage,base:financeBase,customerBase:auditUrls.customer || `http://${demoHost}:${ports.customer}`,db,actor:adminId,item:itemId});}
  finally {await financeContext.close();}
  if (process.env.JAYDS_SYSTEM_AUDIT === "1") {
    const deepContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
    const deepBase = await attach(deepContext, "admin", ports.admin);
    const deepPage = await deepContext.newPage();
    try {
      const completed = await completeAdminJourneys({ page: deepPage, base: deepBase, db, stockId, actor: adminId });
      if (completed.some(row => row.status === "FAIL")) process.exitCode = 1;
    } finally { await deepContext.close(); }
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  await posContext.close();
  await customerContext.close();
  console.log(
    "Admin desktop/tablet/phone, keyboard focus, failed saves, approval, partial receiving, all operations routes, and POS/mobile configuration availability passed against isolated PostgreSQL and Realtime protocol fixtures.",
  );
  }
} finally {
  await browser.close();
  await db.close();
  servers.forEach((s) => s.kill());
}
