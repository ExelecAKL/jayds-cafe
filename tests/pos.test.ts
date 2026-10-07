import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  addLine,
  draftTotals,
  emptyDraft,
  readDraft,
} from "../packages/shared/src/pos/draft.ts";
import type { RegisterLine } from "../packages/shared/src/pos/types.ts";
const actor = "10000000-0000-4000-8000-000000000001";
const customer = "10000000-0000-4000-8000-000000000002";
const menu = "20000000-0000-4000-8000-000000000001";
const stock = "30000000-0000-4000-8000-000000000001";
async function database() {
  const db = new PGlite();
  await db.exec(readFileSync("tests/fixtures/inventory-base.sql", "utf8"));
  await db.exec(
    "ALTER TABLE profiles ADD COLUMN is_approved boolean DEFAULT true; CREATE TABLE pickup_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),token_hash text UNIQUE,is_used boolean DEFAULT false); CREATE TABLE guest_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),receipt_token text UNIQUE,receipt_data jsonb,created_at timestamptz DEFAULT now(),expires_at timestamptz DEFAULT now()+interval '30 days'); ALTER TABLE guest_receipts ENABLE ROW LEVEL SECURITY; CREATE POLICY guest_receipts_public_read ON guest_receipts FOR SELECT USING(true); CREATE POLICY receipt_staff ON guest_receipts FOR SELECT USING(EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('staff','admin')));",
  );
  await db.query(
    "SELECT set_config('request.jwt.claim.role','service_role',false)",
  );
  await db.query(
    "INSERT INTO profiles(id,role,points) VALUES($1,'staff',100),($2,'customer',100)",
    [actor, customer],
  );
  await db.query(
    "INSERT INTO ingredients(id,name,current_stock) VALUES($1,'Beans',10)",
    [stock],
  );
  await db.query(
    "INSERT INTO menu_items(id,name,price) VALUES($1,'Coffee',100)",
    [menu],
  );
  await db.query(
    "INSERT INTO menu_item_ingredients(menu_item_id,ingredient_id,quantity_used) VALUES($1,$2,2)",
    [menu, stock],
  );
  for (const name of [
    "20261002000100_inventory_operations.sql",
    "20261002000200_atomic_orders_forecasts.sql",
    "20261002000300_operations_overview.sql",
    "20261002000400_pos_cashier.sql",
    "20261007000400_distinguish_delivery_pickup.sql",
    "20261007000500_guest_pickup_qr.sql",
    "20261007000600_cash_at_pickup.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
  await db.exec("UPDATE inventory_settings SET enforcement_enabled=true");
  return db;
}
const order = (points = 0, extra: Record<string, unknown> = {}) => ({
  order_source: "pos",
  order_type: "pickup",
  payment_method: "cash",
  customer_id: points ? customer : null,
  points_redeemed: points,
  subtotal: 100,
  total: 100 - points / 10,
  discount: points / 10,
  ...extra,
});

test("delivery cannot use pickup tokens or counter collection; ordinary pickup is unchanged", async () => {
  const db = await database();
  try {
    const delivery = (
      await db.query<{ result: { id: string } }>(
        "SELECT inv_create_order($1,$2,$3,$4) result",
        [
          JSON.stringify(
            order(0, {
              order_type: "delivery",
              order_source: "app",
              customer_id: customer,
              payment_method: "maya",
            }),
          ),
          JSON.stringify(items()),
          "delivery-guard-0001",
          customer,
        ],
      )
    ).rows[0].result;
    await db.query(
      "UPDATE orders SET payment_status='paid',status='confirmed' WHERE id=$1",
      [delivery.id],
    );
    await db.query("SELECT pos_order_action($1,$2,'prepare','confirmed')", [
      actor,
      delivery.id,
    ]);
    await db.query("SELECT pos_order_action($1,$2,'ready','preparing')", [
      actor,
      delivery.id,
    ]);
    await db.query(
      "INSERT INTO pickup_tokens(order_id,token_hash) VALUES($1,'legacy-delivery-token')",
      [delivery.id],
    );
    for (const prefix of ["pickup", "cached"])
      await assert.rejects(
        db.query("SELECT pos_pickup($1,$2)", [
          actor,
          `${prefix}:${delivery.id}:legacy-delivery-token`,
        ]),
        /delivery order/i,
      );
    await assert.rejects(
      db.query("SELECT pos_order_action($1,$2,'collect','ready')", [
        actor,
        delivery.id,
      ]),
      /courier/i,
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM orders WHERE id=$1",
          [delivery.id],
        )
      ).rows[0].status,
      "ready",
    );
    assert.equal(
      (
        await db.query<{ is_used: boolean }>(
          "SELECT is_used FROM pickup_tokens WHERE order_id=$1",
          [delivery.id],
        )
      ).rows[0].is_used,
      false,
    );
    assert.equal(
      Number(
        (
          await db.query<{ current_stock: string }>(
            "SELECT current_stock FROM ingredients WHERE id=$1",
            [stock],
          )
        ).rows[0].current_stock,
      ),
      8,
      "Rejected pickup does not consume stock again",
    );
    const paid = await checkout(db, "pickup-after-delivery-guard");
    await db.query("SELECT pos_order_action($1,$2,'prepare','confirmed')", [
      actor,
      paid.id,
    ]);
    await db.query("SELECT pos_order_action($1,$2,'ready','preparing')", [
      actor,
      paid.id,
    ]);
    await db.query(
      "INSERT INTO pickup_tokens(order_id,token_hash) VALUES($1,'normal-pickup-token')",
      [paid.id],
    );
    await db.query("SELECT pos_pickup($1,$2)", [
      actor,
      `pickup:${paid.id}:normal-pickup-token`,
    ]);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM orders WHERE id=$1",
          [paid.id],
        )
      ).rows[0].status,
      "completed",
    );
  } finally {
    await db.close();
  }
});
test("guest app pickup requires its order QR and cannot be collected through a counter action", async () => {
  const db = await database();
  try {
    const guest = (
      await db.query<{ result: { id: string } }>(
        "SELECT inv_create_order($1,$2,$3,$4) result",
        [
          JSON.stringify(order(0, { order_source: "app", customer_id: null })),
          JSON.stringify(items()),
          "guest-pickup-guard-001",
          null,
        ],
      )
    ).rows[0].result;
    assert.deepEqual(
      (
        await db.query<{ status: string; payment_status: string }>(
          "SELECT status,payment_status FROM orders WHERE id=$1",
          [guest.id],
        )
      ).rows[0],
      { status: "pending", payment_status: "pending" },
      "Cash app submission starts unpaid and uncollected",
    );
    assert.equal(
      (
        await db.query("SELECT * FROM pos_cash_payments WHERE order_id=$1", [
          guest.id,
        ])
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query("SELECT pos_cash_checkout($1,$2,$2,100,100,NULL,NULL,$3)", [
        actor,
        "guest-payment-guard-001",
        guest.id,
      ]),
      /Scan the ready mobile pickup QR/,
    );
    await db.query("SELECT pos_order_action($1,$2,'confirm','pending')", [
      actor,
      guest.id,
    ]);
    await db.query("SELECT pos_order_action($1,$2,'prepare','confirmed')", [
      actor,
      guest.id,
    ]);
    await db.query("SELECT pos_order_action($1,$2,'ready','preparing')", [
      actor,
      guest.id,
    ]);
    assert.deepEqual(
      (
        await db.query<{
          status: string;
          payment_status: string;
          expires_at: null;
        }>("SELECT status,payment_status,expires_at FROM orders WHERE id=$1", [
          guest.id,
        ])
      ).rows[0],
      { status: "ready", payment_status: "pending", expires_at: null },
    );
    assert.equal(
      (
        await db.query("SELECT * FROM pos_cash_payments WHERE order_id=$1", [
          guest.id,
        ])
      ).rows.length,
      0,
    );
    assert.equal(
      Number(
        (
          await db.query<{ current_stock: number }>(
            "SELECT current_stock FROM ingredients WHERE id=$1",
            [stock],
          )
        ).rows[0].current_stock,
      ),
      8,
    );
    await assert.rejects(
      db.query("SELECT pos_order_action($1,$2,'collect','ready')", [
        actor,
        guest.id,
      ]),
      /payment|pickup QR/i,
    );
    await db.query(
      "INSERT INTO pickup_tokens(order_id,token_hash) VALUES($1,'guest-private-token')",
      [guest.id],
    );
    const qr = `pickup:${guest.id}:guest-private-token`;
    const verification = (
      await db.query<{ result: { payment_required: boolean } }>(
        "SELECT pos_pickup($1,$2) result",
        [actor, qr],
      )
    ).rows[0].result;
    assert.equal(verification.payment_required, true);
    assert.equal(
      (
        await db.query<{ is_used: boolean }>(
          "SELECT is_used FROM pickup_tokens WHERE order_id=$1",
          [guest.id],
        )
      ).rows[0].is_used,
      false,
    );
    for (const [token, cash, expected, message] of [
      [`pickup:${guest.id}:wrong-token`, 100, 100, /Invalid pickup QR/],
      [qr, 99, 100, /insufficient/],
      [qr, 100, 101, /total changed/],
    ] as const)
      await assert.rejects(
        db.query("SELECT pos_cash_pickup($1,$2,$2,$3,$4,$5)", [
          actor,
          "failed-handover-000001",
          token,
          cash,
          expected,
        ]),
        message,
      );
    assert.equal(
      (
        await db.query("SELECT * FROM pos_cash_payments WHERE order_id=$1", [
          guest.id,
        ])
      ).rows.length,
      0,
    );
    await db.exec(
      "CREATE FUNCTION fail_cash_collection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='completed' THEN RAISE EXCEPTION 'Handover failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_cash_collection BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION fail_cash_collection();",
    );
    await assert.rejects(
      db.query("SELECT pos_cash_pickup($1,$2,$2,$3,120,100)", [
        actor,
        "guest-handover-000001",
        qr,
      ]),
      /Handover failure/,
    );
    assert.equal(
      (
        await db.query("SELECT * FROM pos_cash_payments WHERE order_id=$1", [
          guest.id,
        ])
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<{ is_used: boolean }>(
          "SELECT is_used FROM pickup_tokens WHERE order_id=$1",
          [guest.id],
        )
      ).rows[0].is_used,
      false,
    );
    await db.exec("DROP TRIGGER fail_cash_collection ON orders");
    const handed = (
      await db.query<{
        result: {
          status: string;
          payment_status: string;
          payment: { change_due: number };
        };
      }>("SELECT pos_cash_pickup($1,$2,$2,$3,120,100) result", [
        actor,
        "guest-handover-000001",
        qr,
      ])
    ).rows[0].result;
    assert.equal(handed.status, "completed");
    assert.equal(handed.payment_status, "paid");
    assert.equal(Number(handed.payment.change_due), 20);
    await db.query("SELECT pos_cash_pickup($1,$2,$2,$3,120,100)", [
      actor,
      "guest-handover-000001",
      qr,
    ]);
    assert.equal(
      (
        await db.query("SELECT * FROM pos_cash_payments WHERE order_id=$1", [
          guest.id,
        ])
      ).rows.length,
      1,
    );
    assert.equal(
      Number(
        (
          await db.query<{ current_stock: number }>(
            "SELECT current_stock FROM ingredients WHERE id=$1",
            [stock],
          )
        ).rows[0].current_stock,
      ),
      8,
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM orders WHERE id=$1",
          [guest.id],
        )
      ).rows[0].status,
      "completed",
    );
  } finally {
    await db.close();
  }
});
const items = (price = 100) => [
  {
    menu_item_id: menu,
    name: "Forged name",
    price,
    quantity: 1,
    subtotal: price,
    variants: [],
    notes: "No lid",
  },
];
async function checkout(
  db: PGlite,
  key = "pos-checkout-000000001",
  extra: {
    cash?: number;
    expected?: number;
    points?: number;
    existing?: string;
    draft?: boolean;
    price?: number;
    fingerprint?: string;
  } = {},
) {
  const points = extra.points ?? 0,
    price = extra.price ?? 100;
  const { rows } = await db.query<{
    result: {
      id: string;
      total: number;
      status: string;
      payment: { cash_received: number; change_due: number } | null;
      receipt: { receipt_token: string };
      already_paid?: boolean;
    };
  }>("SELECT pos_cash_checkout($1,$2,$3,$4,$5,$6,$7,$8) result", [
    actor,
    key,
    extra.fingerprint ?? key,
    extra.cash ?? 100,
    extra.expected ?? price - points / 10,
    extra.existing && !extra.draft
      ? null
      : JSON.stringify(
          order(points, { subtotal: price, total: price - points / 10 }),
        ),
    extra.existing && !extra.draft ? null : JSON.stringify(items(price)),
    extra.existing ?? null,
  ]);
  return rows[0].result;
}
test("register line identities preserve notes, normalize options, merge quantities, and recover drafts safely", () => {
  const line: RegisterLine = {
    line_id: "a",
    menu_item_id: menu,
    name: "Coffee",
    price: 100,
    quantity: 1,
    variants: [
      { variant_group: "size", label: "Large", price_modifier: 20 },
      { variant_group: "sugar_level", label: "Less", price_modifier: 0 },
    ],
    notes: "No lid",
  };
  const merged = addLine([line], {
    ...line,
    line_id: "b",
    variants: [...line.variants].reverse(),
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].quantity, 2);
  assert.equal(
    addLine(merged, { ...line, line_id: "c", notes: "Extra lid" }).length,
    2,
  );
  const draft = {
    ...emptyDraft(),
    items: merged,
    customer: {
      id: customer,
      email: "test@example.test",
      full_name: null,
      points: 100,
    },
    points: 20,
  };
  assert.equal(draftTotals(draft).total, 238);
  assert.deepEqual(readDraft(JSON.stringify(draft)), draft);
  assert.equal(readDraft("{bad").items.length, 0);
  assert.equal(
    readDraft(JSON.stringify({ ...draft, items: [{ ...line, quantity: -1 }] }))
      .items.length,
    0,
  );
});
test("cash checkout commits canonical orders, rewards, reservations, tender and one reusable receipt", async () => {
  const db = await database();
  try {
    const first = await checkout(db, undefined, { points: 10 });
    assert.equal(first.status, "confirmed");
    assert.equal(first.total, 99);
    assert.equal(first.payment?.change_due, 1);
    assert.equal((await checkout(db, undefined, { points: 10 })).id, first.id);
    await assert.rejects(
      checkout(db, undefined, { fingerprint: "changed" }),
      /different data/,
    );
    assert.equal(
      (await db.query("SELECT * FROM guest_receipts")).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query<{ points: number }>(
          "SELECT points FROM profiles WHERE id=$1",
          [customer],
        )
      ).rows[0].points,
      90,
    );
    assert.equal(
      (await db.query<{ name: string }>("SELECT name FROM order_items")).rows[0]
        .name,
      "Coffee",
    );
    assert.equal(
      Number(
        (
          await db.query<{ current_stock: string }>(
            "SELECT current_stock FROM ingredients",
          )
        ).rows[0].current_stock,
      ),
      10,
    );
    await db.query("SELECT pos_order_action($1,$2,'prepare','confirmed')", [
      actor,
      first.id,
    ]);
    assert.equal(
      Number(
        (
          await db.query<{ current_stock: string }>(
            "SELECT current_stock FROM ingredients",
          )
        ).rows[0].current_stock,
      ),
      8,
    );
    await db.query("SELECT pos_order_action($1,$2,'prepare','confirmed')", [
      actor,
      first.id,
    ]);
    await db.query("SELECT pos_order_action($1,$2,'ready','preparing')", [
      actor,
      first.id,
    ]);
    await db.query("SELECT pos_order_action($1,$2,'collect','ready')", [
      actor,
      first.id,
    ]);
    assert.equal(
      Number(
        (
          await db.query<{ current_stock: string }>(
            "SELECT current_stock FROM ingredients",
          )
        ).rows[0].current_stock,
      ),
      8,
    );
  } finally {
    await db.close();
  }
});
test("invalid tender, changed totals, insufficient stock, and receipt failure leave no partial sale or rewards", async () => {
  const db = await database();
  try {
    for (const [key, extra, pattern] of [
      ["cash-insufficient-0001", { cash: 90 }, /insufficient/],
      ["cash-changed-00000001", { expected: 101 }, /total changed/],
      ["cash-decimals-0000001", { cash: 100.001 }, /two decimals/],
      ["cash-nan-00000000001", { cash: NaN }, /valid cash/],
    ] as const)
      await assert.rejects(checkout(db, key, extra), pattern);
    await db.exec(
      "CREATE FUNCTION fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Receipt fixture failure'; END $$; CREATE TRIGGER fail_receipt BEFORE INSERT ON guest_receipts FOR EACH ROW EXECUTE FUNCTION fail_receipt();",
    );
    await assert.rejects(
      checkout(db, "cash-receipt-fail-0001", { points: 10 }),
      /Receipt fixture/,
    );
    assert.equal((await db.query("SELECT * FROM orders")).rows.length, 0);
    assert.equal(
      (await db.query("SELECT * FROM pos_cash_payments")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("SELECT * FROM stock_reservations")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<{ points: number }>(
          "SELECT points FROM profiles WHERE id=$1",
          [customer],
        )
      ).rows[0].points,
      100,
    );
    await db.exec("DROP TRIGGER fail_receipt ON guest_receipts");
    await db.query(
      "SELECT inv_post_movement($1,9,'waste','Fixture shortage')",
      [stock],
    );
    await assert.rejects(checkout(db, "cash-shortage-0000001"), /stock/i);
    assert.equal((await db.query("SELECT * FROM orders")).rows.length, 0);
  } finally {
    await db.close();
  }
});
test("parked drafts accept reviewed current prices while preserving the original ticket and accepted snapshots", async () => {
  const db = await database();
  try {
    const parked = (
      await db.query<{ result: { id: string } }>(
        "SELECT inv_create_order($1,$2,$3,$4) result",
        [
          JSON.stringify(order(0, { is_parked: true })),
          JSON.stringify(items()),
          "park-original-00000001",
          actor,
        ],
      )
    ).rows[0].result;
    assert.equal(
      (
        await db.query(
          "SELECT * FROM stock_reservations WHERE state='reserved'",
        )
      ).rows.length,
      0,
    );
    await db.exec("UPDATE menu_items SET price=120");
    await assert.rejects(
      checkout(db, "park-reprice-00000001", {
        existing: parked.id,
        draft: true,
        price: 120,
        expected: 100,
        cash: 150,
      }),
      /total changed/,
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM orders WHERE id=$1",
          [parked.id],
        )
      ).rows[0].status,
      "pending",
    );
    const accepted = await checkout(db, "park-reprice-00000001", {
      existing: parked.id,
      draft: true,
      price: 120,
      cash: 150,
    });
    assert.notEqual(accepted.id, parked.id);
    assert.equal(accepted.total, 120);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM orders WHERE id=$1",
          [parked.id],
        )
      ).rows[0].status,
      "cancelled",
    );
    await assert.rejects(
      checkout(db, "edit-accepted-0000001", {
        existing: accepted.id,
        draft: true,
      }),
      /closed|paid|edited/,
    );
  } finally {
    await db.close();
  }
});
test("existing cash orders reject expiry, cancellation, wrong payment method and unapproved staff", async () => {
  const db = await database();
  try {
    const existing = (
      await db.query<{ result: { id: string } }>(
        "SELECT inv_create_order($1,$2,$3,$4) result",
        [
          JSON.stringify(order()),
          JSON.stringify(items()),
          "existing-unpaid-00001",
          actor,
        ],
      )
    ).rows[0].result;
    await db.query(
      "UPDATE orders SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [existing.id],
    );
    await assert.rejects(
      checkout(db, "cash-expired-00000001", { existing: existing.id }),
      /expired/,
    );
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [
      existing.id,
    ]);
    await assert.rejects(
      checkout(db, "cash-cancelled-000001", { existing: existing.id }),
      /closed/,
    );
    await db.query("UPDATE profiles SET is_approved=false WHERE id=$1", [
      actor,
    ]);
    await assert.rejects(
      checkout(db, "cash-unapproved-00001"),
      /Approved staff/,
    );
  } finally {
    await db.close();
  }
});
test("pickup checks paid and ready state, updates token and order atomically, and exposes only safe TV and receipt projections", async () => {
  const db = await database();
  try {
    const paid = await checkout(db);
    await db.query(
      "INSERT INTO pickup_tokens(order_id,token_hash) VALUES($1,$2)",
      [paid.id, "fixture-token"],
    );
    const qr = "pickup:" + paid.id + ":fixture-token";
    await assert.rejects(
      db.query("SELECT pos_pickup($1,$2)", [actor, qr]),
      /not ready/,
    );
    await db.query("SELECT pos_order_action($1,$2,'prepare','confirmed')", [
      actor,
      paid.id,
    ]);
    await db.query("SELECT pos_order_action($1,$2,'ready','preparing')", [
      actor,
      paid.id,
    ]);
    await db.exec(
      "CREATE FUNCTION fail_complete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='completed' THEN RAISE EXCEPTION 'Completion fixture failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_complete BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION fail_complete();",
    );
    await assert.rejects(
      db.query("SELECT pos_pickup($1,$2)", [actor, qr]),
      /Completion fixture/,
    );
    assert.equal(
      (
        await db.query<{ is_used: boolean }>(
          "SELECT is_used FROM pickup_tokens",
        )
      ).rows[0].is_used,
      false,
    );
    await db.exec("DROP TRIGGER fail_complete ON orders");
    await db.exec(
      "SET ROLE anon; SELECT set_config('request.jwt.claim.role','anon',false)",
    );
    const board = (
      await db.query<{ result: { orders: Record<string, unknown>[] } }>(
        "SELECT get_pos_status_board() result",
      )
    ).rows[0].result;
    assert.deepEqual(Object.keys(board.orders[0]).sort(), [
      "order_number",
      "status",
    ]);
    await assert.rejects(
      db.query("SELECT * FROM guest_receipts"),
      /permission denied|not allowed/,
    );
    assert.ok(
      (
        await db.query<{ result: unknown }>(
          "SELECT get_guest_receipt($1) result",
          [paid.receipt.receipt_token],
        )
      ).rows[0].result,
    );
    await assert.rejects(
      db.query("SELECT pos_pickup($1,$2)", [actor, qr]),
      /permission denied/,
    );
    await db.exec(
      "RESET ROLE; SELECT set_config('request.jwt.claim.role','service_role',false)",
    );
    await db.query("SELECT pos_pickup($1,$2)", [actor, qr]);
    assert.equal(
      (
        await db.query<{ result: { already_collected: boolean } }>(
          "SELECT pos_pickup($1,$2) result",
          [actor, qr],
        )
      ).rows[0].result.already_collected,
      true,
    );
  } finally {
    await db.close();
  }
});

test("parked edits preserve customer selection, reserve nothing, and replace only unpaid parked tickets", async () => {
  const db = await database();
  try {
    const draft = {
      ...order(0, { customer_id: customer, is_parked: true }),
      notes: "Counter pickup",
    };
    const first = (
      await db.query<{ result: { id: string } }>(
        "SELECT pos_save_parked($1,$2,$3,$4,$5) result",
        [
          actor,
          JSON.stringify(draft),
          JSON.stringify(items()),
          "park-save-first-000001",
          "original",
        ],
      )
    ).rows[0].result;
    const replacement = (
      await db.query<{ result: { id: string } }>(
        "SELECT pos_save_parked($1,$2,$3,$4,$5,$6) result",
        [
          actor,
          JSON.stringify({ ...draft, notes: "Updated notes" }),
          JSON.stringify(items()),
          "park-save-second-00001",
          "changed",
          first.id,
        ],
      )
    ).rows[0].result;
    assert.notEqual(first.id, replacement.id);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM orders WHERE id=$1",
          [first.id],
        )
      ).rows[0].status,
      "cancelled",
    );
    const retry = (
      await db.query<{ result: { id: string } }>(
        "SELECT pos_save_parked($1,$2,$3,$4,$5,$6) result",
        [
          actor,
          JSON.stringify({ ...draft, notes: "Updated notes" }),
          JSON.stringify(items()),
          "park-save-second-00001",
          "changed",
          first.id,
        ],
      )
    ).rows[0].result;
    assert.equal(retry.id, replacement.id);
    assert.equal(
      (
        await db.query(
          "SELECT * FROM orders WHERE is_parked AND status='pending'",
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "SELECT * FROM stock_reservations WHERE state='reserved'",
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<{ customer_id: string }>(
          "SELECT customer_id FROM orders WHERE id=$1",
          [replacement.id],
        )
      ).rows[0].customer_id,
      customer,
    );
    const paid = await checkout(db, "park-accepted-0000001", {
      existing: replacement.id,
      draft: true,
    });
    await assert.rejects(
      db.query("SELECT pos_save_parked($1,$2,$3,$4,$5,$6)", [
        actor,
        JSON.stringify(draft),
        JSON.stringify(items()),
        "park-edit-paid-0000001",
        "paid",
        paid.id,
      ]),
      /Only parked unpaid/,
    );
  } finally {
    await db.close();
  }
});
