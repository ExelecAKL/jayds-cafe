import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { readJsonBody, JsonBodyError, ORDER_BODY_LIMIT } from "../packages/shared/src/server/request-body.ts";
import { normalizeContactPhone, isValidContactPhone } from "../packages/shared/src/customer/phone.ts";
import { LEGAL_VERSION } from "../apps/customer/lib/legal.ts";

test("delivery requires a valid contact before pricing or provider calls, while formatted mobile contacts reach pricing", async () => {
  let pricingCalls = 0;
  const loaded = { exports: {} as { POST: (request: Request) => Promise<Response> } };
  const requireNode = createRequire(import.meta.url);
  class AccessError extends Error {}
  const mocks: Record<string, unknown> = {
    "next/server": { NextResponse: { json: Response.json } },
    "@supabase/supabase-js": { createClient: () => ({ from() { throw Error("Database writes are forbidden in contact validation"); } }) },
    "@cafeos/shared/server/request-body": { readJsonBody, JsonBodyError, ORDER_BODY_LIMIT },
    "@cafeos/shared/customer/phone": { normalizeContactPhone, isValidContactPhone },
    "@cafeos/shared/inventory/orders": { submissionIdentity: () => ({ key: "contact-validation", fingerprint: "unchanged" }), findSubmission: async () => null, CatalogValidationError: AccessError },
    "./pricing": { OrderValidationError: AccessError, priceOrder: async () => { pricingCalls++; throw Error("Positive control reached pricing; no sale created"); } },
    "../../../../lib/server-access": { assertSameOrigin() {}, issueGuestOrderGrant() { throw Error("No order grant may be issued"); }, ApiAccessError: AccessError, apiAccessErrorResponse: () => Response.json({}, { status: 500 }) },
    "../../../../lib/legal": { LEGAL_VERSION },
  };
  const source = ts.transpileModule(readFileSync("apps/customer/app/api/orders/create/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module: loaded, exports: loaded.exports, require: (name: string) => mocks[name] ?? requireNode(name), process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://isolated.example.test", SUPABASE_SERVICE_ROLE_KEY: "isolated" } }, console: { error() {} }, Request, Response, Date, Buffer }, { filename: "contact-validation-route" });
  const send = (phone: unknown) => loaded.exports.POST(new Request("https://isolated.example.test/api/orders/create", { method: "POST", body: JSON.stringify({ order_type: "delivery", payment_method: "maya", legal_version: LEGAL_VERSION, legal_acknowledged: true, delivery_name: "Isolated recipient", delivery_phone: phone, items: [{ menu_item_id: "20000000-0000-4000-8000-000000000001", name: "Test coffee", price: 100, quantity: 1, subtotal: 100, variants: [] }] }) }));
  for (const phone of [null, "", "           ", "bad-phone", "0000000000", "09-12"]) {
    const response = await send(phone); assert.equal(response.status, 400); assert.match((await response.json()).error, /valid phone/i);
  }
  assert.equal(pricingCalls, 0);
  for (const phone of ["0912 345 6789", "+63 (912) 345-6789"]) {
    assert.equal(isValidContactPhone(normalizeContactPhone(phone)), true);
    assert.equal((await send(phone)).status, 500); // Explicit no-sale sentinel after validation.
  }
  assert.equal(pricingCalls, 2);
  assert.equal(normalizeContactPhone("0912 345 6789"), "09123456789");
});
