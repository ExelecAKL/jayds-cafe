import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { arch, platform } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import pg from "pg";

async function unusedPort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

function run(binary: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, stdio: "pipe" });
    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.stderr.on("data", (data) => {
      output += data.toString();
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `PostgreSQL helper exited ${code}: ${output.slice(-2000)}`,
            ),
          ),
    );
  });
}

async function waitsForLock(observer: pg.Client, pid: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const status = await observer.query(
      "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",
      [pid],
    );
    if (status.rows[0]?.wait_event_type === "Lock") return;
    await delay(25);
  }
  assert.fail(
    "The competing database connection did not wait for a transaction lock",
  );
}

test(
  "native PostgreSQL locks channel orders, cash sales, duplicate retries, receiving, and stale counts",
  { timeout: 60_000 },
  async (t) => {
    const platformName = platform() === "win32" ? "windows" : platform();
    const binaries = (await import(
      `@embedded-postgres/${platformName}-${arch()}`
    )) as { initdb: string; postgres: string; pg_ctl: string };
    const logs = path.resolve(".codex-logs");
    mkdirSync(logs, { recursive: true });
    const directory = path.resolve(
      mkdtempSync(path.join(logs, "pg-concurrency-")),
    );
    assert.ok(
      directory.startsWith(logs + path.sep),
      "Fixture must stay inside the workspace log directory",
    );
    const passwordFile = path.join(directory, "fixture-password");
    const dataDirectory = path.join(directory, "data");
    const password = randomUUID();
    writeFileSync(passwordFile, password + "\n");
    const port = await unusedPort();
    const clients: pg.Client[] = [];
    let started = false;
    try {
      await run(binaries.initdb, [
        "-D",
        dataDirectory,
        "-U",
        "postgres",
        "--auth=scram-sha-256",
        "--encoding=UTF8",
        "--locale=C",
        `--pwfile=${passwordFile}`,
      ]);
      rmSync(passwordFile);
      const server = spawn(
        binaries.postgres,
        [
          "-D",
          dataDirectory,
          "-p",
          String(port),
          "-c",
          "listen_addresses=127.0.0.1",
          "-c",
          "log_min_messages=warning",
        ],
        { windowsHide: true, stdio: "pipe" },
      );
      let errors = "";
      server.stdout.resume();
      server.stderr.on("data", (data) => {
        errors += data.toString();
      });
      server.on("error", (error) => {
        errors += error.message;
      });
      for (let attempt = 0; attempt < 100; attempt++) {
        const client = new pg.Client({
          host: "127.0.0.1",
          port,
          user: "postgres",
          password,
          database: "postgres",
          connectionTimeoutMillis: 500,
        });
        try {
          await client.connect();
          clients.push(client);
          started = true;
          break;
        } catch {
          await client.end();
          await delay(50);
        }
      }
      assert.ok(started, `Isolated PostgreSQL did not start: ${errors}`);
      const control = clients[0];
      for (let index = 0; index < 2; index++) {
        const client = new pg.Client({
          host: "127.0.0.1",
          port,
          user: "postgres",
          password,
          database: "postgres",
        });
        await client.connect();
        clients.push(client);
      }
      const [pos, mobile] = clients.slice(1);
      const admin = "10000000-0000-4000-8000-000000000001";
      const customer = "10000000-0000-4000-8000-000000000002";
      const item = "20000000-0000-4000-8000-000000000001";
      const stock = "30000000-0000-4000-8000-000000000001";
      await control.query(
        readFileSync("tests/fixtures/inventory-base.sql", "utf8"),
      );
      await control.query(`
        ALTER TABLE profiles ADD COLUMN is_approved boolean NOT NULL DEFAULT true;
        CREATE TABLE pickup_tokens (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid REFERENCES orders(id),
          token_hash text NOT NULL, is_used boolean NOT NULL DEFAULT false,
          created_at timestamptz DEFAULT now()
        );
        CREATE TABLE guest_receipts (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid REFERENCES orders(id),
          receipt_token text NOT NULL UNIQUE, receipt_data jsonb NOT NULL,
          created_at timestamptz DEFAULT now(), expires_at timestamptz DEFAULT now()+interval '30 days'
        );
        ALTER TABLE guest_receipts ENABLE ROW LEVEL SECURITY;
        CREATE POLICY guest_receipts_public_read ON guest_receipts FOR SELECT USING(true);
      `);
      await control.query(
        "INSERT INTO profiles(id,role,points) VALUES($1,'admin',100),($2,'customer',100)",
        [admin, customer],
      );
      await control.query(
        "INSERT INTO ingredients(id,name,current_stock) VALUES($1,'Concurrent beans',2)",
        [stock],
      );
      await control.query(
        "INSERT INTO menu_items(id,name,price) VALUES($1,'Concurrent coffee',100)",
        [item],
      );
      await control.query(
        "INSERT INTO menu_item_ingredients(menu_item_id,ingredient_id,quantity_used) VALUES($1,$2,2)",
        [item, stock],
      );
      await control.query(
        "SELECT set_config('request.jwt.claim.role','service_role',false)",
      );
      await control.query(
        readFileSync("supabase/jayds_inventory_upgrade.sql", "utf8"),
      );
      await control.query(
        readFileSync(
          "supabase/migrations/20261002000400_pos_cashier.sql",
          "utf8",
        ),
      );
      await control.query(
        "UPDATE inventory_settings SET enforcement_enabled=true",
      );
      for (const client of [pos, mobile]) {
        await client.query(
          "SELECT set_config('request.jwt.claim.role','service_role',false),set_config('request.jwt.claim.sub',$1,false)",
          [admin],
        );
        await client.query(
          "SET statement_timeout='10s'; SET lock_timeout='8s'",
        );
      }
      const mobilePid = (await mobile.query("SELECT pg_backend_pid() pid"))
        .rows[0].pid as number;
      const submit = (client: pg.Client, key: string, source = "pos") =>
        client.query("SELECT inv_create_order($1,$2,$3,$4,NULL,$3) result", [
          JSON.stringify({
            order_source: source,
            customer_id: source === "app" ? customer : null,
            order_type: "pickup",
            payment_method: "cash",
            subtotal: 100,
            total: source === "app" ? 99 : 100,
            discount: source === "app" ? 1 : 0,
            points_redeemed: source === "app" ? 10 : 0,
          }),
          JSON.stringify([
            {
              menu_item_id: item,
              price: 100,
              subtotal: 100,
              quantity: 1,
              variants: [],
            },
          ]),
          key,
          source === "app" ? customer : admin,
        ]);

      await pos.query("BEGIN");
      const accepted = (await submit(pos, "native-pos-order-000001")).rows[0]
        .result.id as string;
      const competing = submit(mobile, "native-app-order-000001", "app").then(
        () => null,
        (error: Error) => error,
      );
      await waitsForLock(control, mobilePid);
      await pos.query("COMMIT");
      assert.match((await competing)?.message ?? "", /Insufficient stock/);
      assert.equal(
        (await control.query("SELECT count(*)::integer count FROM orders"))
          .rows[0].count,
        1,
      );
      assert.equal(
        (
          await control.query("SELECT points FROM profiles WHERE id=$1", [
            customer,
          ])
        ).rows[0].points,
        100,
      );
      t.diagnostic(
        "Independent POS/mobile connections contended on locks; the rejected order left no stock or reward changes.",
      );

      await control.query("UPDATE orders SET status='cancelled' WHERE id=$1", [
        accepted,
      ]);
      await pos.query("BEGIN");
      const retryOriginal = (await submit(pos, "native-retry-order-0001"))
        .rows[0].result.id as string;
      const retry = submit(mobile, "native-retry-order-0001");
      await waitsForLock(control, mobilePid);
      await pos.query("COMMIT");
      assert.equal((await retry).rows[0].result.id, retryOriginal);
      assert.equal(
        (
          await control.query(
            "SELECT count(*)::integer count FROM stock_reservations WHERE state='reserved'",
          )
        ).rows[0].count,
        1,
      );

      const supplier = (
        await control.query(
          "INSERT INTO suppliers(name) VALUES('Concurrent supplier') RETURNING id",
        )
      ).rows[0].id;
      const purchase = (
        await control.query(
          "SELECT inv_save_po(NULL,$1,NULL,'Concurrent receipt',$2) id",
          [
            supplier,
            JSON.stringify([
              { ingredient_id: stock, quantity: 2, unit_cost: 1 },
            ]),
          ],
        )
      ).rows[0].id;
      await control.query("SELECT inv_po_transition($1,'approved');", [
        purchase,
      ]);
      await control.query("SELECT inv_po_transition($1,'ordered');", [
        purchase,
      ]);
      const receive = (client: pg.Client) =>
        client.query(
          "SELECT inv_receive_po($1,'Same physical delivery',$2,$3)",
          [
            purchase,
            JSON.stringify([
              { ingredient_id: stock, quantity: 1, unit_cost: 1 },
            ]),
            randomUUID(),
          ],
        );
      await pos.query("BEGIN");
      await receive(pos);
      const duplicate = receive(mobile).then(
        () => null,
        (error: Error) => error,
      );
      await waitsForLock(control, mobilePid);
      await pos.query("COMMIT");
      assert.match((await duplicate)?.message ?? "", /unique|duplicate/i);
      assert.equal(
        Number(
          (
            await control.query(
              "SELECT current_stock FROM ingredients WHERE id=$1",
              [stock],
            )
          ).rows[0].current_stock,
        ),
        3,
      );
      assert.equal(
        Number(
          (
            await control.query(
              "SELECT received_quantity FROM purchase_order_lines WHERE purchase_order_id=$1",
              [purchase],
            )
          ).rows[0].received_quantity,
        ),
        1,
      );

      const count = (
        await control.query(
          "INSERT INTO stocktakes(ingredient_id,expected,counted,version,reason) SELECT id,current_stock,current_stock,stock_version,'Concurrent count' FROM ingredients WHERE id=$1 RETURNING id",
          [stock],
        )
      ).rows[0].id;
      await pos.query("BEGIN");
      await pos.query(
        "SELECT inv_post_movement($1,1,'waste','Spill during count')",
        [stock],
      );
      const stale = mobile.query("SELECT inv_post_stocktake($1)", [count]).then(
        () => null,
        (error: Error) => error,
      );
      await waitsForLock(control, mobilePid);
      await pos.query("COMMIT");
      assert.match((await stale)?.message ?? "", /Recount/);
      assert.equal(
        (
          await control.query("SELECT state FROM stocktakes WHERE id=$1", [
            count,
          ])
        ).rows[0].state,
        "draft",
      );
      assert.equal(
        Number(
          (
            await control.query(
              "SELECT current_stock FROM ingredients WHERE id=$1",
              [stock],
            )
          ).rows[0].current_stock,
        ),
        2,
      );

      // Release the earlier unpaid fixture ticket. Only one two-unit cash sale can fit.
      await control.query("UPDATE orders SET status='cancelled' WHERE id=$1", [
        retryOriginal,
      ]);
      const beforeCashOrders = (
        await control.query("SELECT count(*)::integer count FROM orders")
      ).rows[0].count as number;
      const cash = (client: pg.Client, key: string) =>
        client.query(
          "SELECT pos_cash_checkout($1,$2,$2,120,99,$3,$4,NULL) result",
          [
            admin,
            key,
            JSON.stringify({
              order_source: "pos",
              customer_id: customer,
              order_type: "pickup",
              payment_method: "cash",
              subtotal: 100,
              total: 99,
              discount: 1,
              points_redeemed: 10,
            }),
            JSON.stringify([
              {
                menu_item_id: item,
                price: 100,
                subtotal: 100,
                quantity: 1,
                variants: [],
              },
            ]),
          ],
        );
      await pos.query("BEGIN");
      const paid = (await cash(pos, "native-cash-sale-000001")).rows[0].result;
      const cashCompetitor = cash(mobile, "native-cash-sale-000002").then(
        () => null,
        (error: Error) => error,
      );
      await waitsForLock(control, mobilePid);
      await pos.query("COMMIT");
      assert.match((await cashCompetitor)?.message ?? "", /Insufficient stock/);
      assert.equal(
        (await control.query("SELECT count(*)::integer count FROM orders"))
          .rows[0].count,
        beforeCashOrders + 1,
      );
      assert.equal(
        (
          await control.query(
            "SELECT count(*)::integer count FROM pos_cash_payments",
          )
        ).rows[0].count,
        1,
      );
      assert.equal(
        (
          await control.query(
            "SELECT count(*)::integer count FROM guest_receipts",
          )
        ).rows[0].count,
        1,
      );
      assert.equal(
        (
          await control.query("SELECT points FROM profiles WHERE id=$1", [
            customer,
          ])
        ).rows[0].points,
        90,
      );
      assert.equal(paid.payment.change_due, 21);
      t.diagnostic(
        "Concurrent cash checkouts contended on stock; the rejected sale left no payment, receipt, order, or reward changes.",
      );

      await control.query("UPDATE orders SET status='cancelled' WHERE id=$1", [
        paid.id,
      ]);
      await pos.query("BEGIN");
      const cashOriginal = (await cash(pos, "native-cash-retry-00001")).rows[0]
        .result;
      const cashRetry = cash(mobile, "native-cash-retry-00001");
      await waitsForLock(control, mobilePid);
      await pos.query("COMMIT");
      const canonicalRetry = (await cashRetry).rows[0].result;
      assert.equal(canonicalRetry.id, cashOriginal.id);
      assert.equal(
        canonicalRetry.receipt.receipt_token,
        cashOriginal.receipt.receipt_token,
      );
      assert.deepEqual(canonicalRetry.payment, cashOriginal.payment);
      assert.equal(
        (
          await control.query(
            "SELECT count(*)::integer count FROM pos_cash_payments WHERE order_id=$1",
            [cashOriginal.id],
          )
        ).rows[0].count,
        1,
      );
      assert.equal(
        (
          await control.query(
            "SELECT count(*)::integer count FROM guest_receipts WHERE order_id=$1",
            [cashOriginal.id],
          )
        ).rows[0].count,
        1,
      );
      assert.equal(
        (
          await control.query("SELECT points FROM profiles WHERE id=$1", [
            customer,
          ])
        ).rows[0].points,
        90,
      );
      t.diagnostic(
        "Simultaneous retries with one checkout key reused the accepted sale, recorded tender, and receipt without double redemption.",
      );
    } finally {
      await Promise.allSettled(clients.map((client) => client.end()));
      if (started)
        await run(binaries.pg_ctl, [
          "-D",
          dataDirectory,
          "-m",
          "fast",
          "-w",
          "stop",
        ]);
      const cleanupTarget = path.resolve(directory);
      assert.ok(
        cleanupTarget.startsWith(logs + path.sep),
        "Refusing to remove files outside the fixture directory",
      );
      rmSync(cleanupTarget, { recursive: true, force: true });
    }
  },
);
