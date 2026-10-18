import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  authEmailContent,
  authEmailTemplate,
  invoiceEmail,
} from "../packages/shared/src/email/templates";
import { calculateFinancials } from "../packages/shared/src/finance/calculations";
import type { InvoiceRecord } from "../packages/shared/src/finance/types";
import {
  invoiceMailConfig,
  deliverInvoiceEmail,
  InvoiceMailError,
} from "../packages/shared/src/email/delivery";
import { getCustomerAuthErrorMessage } from "../apps/customer/utils/authMessages";
export function emailInvoiceFixture(): InvoiceRecord {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    order_id: "20000000-0000-4000-8000-000000000002",
    number: "JD-00000042",
    kind: "invoice",
    issued_at: "2026-10-18T03:00:00Z",
    original_invoice: null,
    buyer: { name: "Alex Santos" },
    business: {
      registered_name: "INVOICE PREVIEW OWNER",
      trade_name: "Jayds Café",
      tin: "000-000-000",
      branch_code: "00000",
      address: "Sample café address",
      numbering: "system_generated",
      authority_basis: "Preview only",
      authorization_reference: null,
      authorization_date: null,
      approved_serial_start: null,
      approved_serial_end: null,
    },
    breakdown: calculateFinancials({
      items: [
        {
          menu_item_id: "30000000-0000-4000-8000-000000000001",
          name: "Spanish Latte",
          price: 112,
          quantity: 2,
        },
      ],
    }),
  };
}
test("all six account templates preserve Supabase confirmation/code placeholders and approved branding", () => {
  for (const kind of Object.keys(
    authEmailContent,
  ) as (keyof typeof authEmailContent)[]) {
    const template = authEmailTemplate(kind);
    assert.equal(
      readFileSync(`supabase/email-templates/${kind}.html`, "utf8"),
      template.html + "\n",
    );
    assert.match(template.html, /email\/jayds-logo\.png/);
    assert.match(template.html, /lang="en"/);
    assert.match(template.html, /width="600"/);
    if (kind === "reauthentication")
      assert.match(template.html, /{{ \.Token }}/);
    else assert.match(template.html, /href="{{ \.ConfirmationURL }}"/);
    assert.doesNotMatch(template.html, /localhost|<script|javascript:|thesis/i);
  }
});
test("invoice emails use issued centavo values, escape customer/product fields and link to owner-authorized PDF view", () => {
  const fixture = emailInvoiceFixture();
  fixture.buyer.name = '<img src=x onerror="alert(1)">';
  fixture.breakdown.lines[0].name = "<script>wrong()</script>";
  const before = JSON.stringify(fixture),
    rendered = invoiceEmail(fixture);
  assert.match(rendered.html, /&lt;img/);
  assert.doesNotMatch(rendered.html, /<script>|<img src=x/);
  assert.match(rendered.html, /₱224\.00/);
  assert.match(rendered.html, /₱24\.00/);
  assert.match(
    rendered.html,
    /\/orders\/20000000-0000-4000-8000-000000000002\/invoice/,
  );
  assert.doesNotMatch(rendered.html, /access_token|receipt_token|token=/);
  assert.equal(JSON.stringify(fixture), before);
  fixture.kind = "credit_note";
  fixture.original_number = "JD-00000041";
  assert.match(invoiceEmail(fixture).text, /Credits invoice: JD-00000041/);
  fixture.breakdown.total = NaN;
  assert.throws(() => invoiceEmail(fixture), /snapshot/);
});
test("email transport is unconfigured by default, uses stable idempotency, bounds requests and redacts failures", async () => {
  assert.equal(invoiceMailConfig({}), null);
  assert.equal(
    invoiceMailConfig({
      RESEND_API_KEY: "fixture",
      INVOICE_EMAIL_FROM: "x\r\nBcc:bad@example.test",
    }),
    null,
  );
  const config = invoiceMailConfig({
    RESEND_API_KEY: "fixture",
    INVOICE_EMAIL_FROM: "Jayds Café <receipts@example.test>",
  })!;
  const body = {
    from: config.from,
    to: ["customer@example.test"],
    ...invoiceEmail(emailInvoiceFixture()),
  };
  const sent = await deliverInvoiceEmail(
    config,
    "invoice/stable",
    body,
    async (input, init) => {
      assert.equal(input, "https://api.resend.com/emails");
      assert.equal(
        new Headers(init?.headers).get("Idempotency-Key"),
        "invoice/stable",
      );
      assert.deepEqual(JSON.parse(String(init?.body)), body);
      assert.ok(init?.signal);
      return Response.json({ id: "provider-fixture-id" });
    },
  );
  assert.equal(sent, "provider-fixture-id");
  for (const [status, retryable] of [
    [429, true],
    [500, true],
    [403, false],
    [422, false],
  ] as const) {
    await assert.rejects(
      () =>
        deliverInvoiceEmail(config, "invoice/stable", body, async () =>
          Response.json(
            { error: "private customer@example.test and secret data" },
            { status },
          ),
        ),
      (error) =>
        error instanceof InvoiceMailError &&
        error.retryable === retryable &&
        !error.message.includes("customer@"),
    );
  }
});
test("account messaging distinguishes the email provider quota from connection throttling", () => {
  assert.match(
    getCustomerAuthErrorMessage({
      message: "Email rate limit exceeded",
      code: "over_email_send_rate_limit",
    }),
    /Email requests/,
  );
  assert.match(
    getCustomerAuthErrorMessage({
      message: "too many requests",
      code: "over_request_rate_limit",
    }),
    /connection/,
  );
  assert.match(
    getCustomerAuthErrorMessage("Invalid login credentials"),
    /Incorrect email or password/,
  );
});
