import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

// Hosted forms, wholly intercepted Auth API. No emails, users or passwords are
// created/changed in Supabase by these positive and negative-path tests.
const base = process.env.JAYDS_AUDIT_CUSTOMER_URL || "https://jaydscafe.vercel.app", out = path.resolve((process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12") + "/auth-forms");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results: { feature: string; status: string; detail: string }[] = [];
async function check(feature: string, work: () => Promise<void>, p: import("@playwright/test").Page) {
  try { await work(); results.push({ feature, status: "PASS", detail: "Hosted form with isolated Auth responses" }); }
  catch (e) { results.push({ feature, status: "FAIL", detail: String(e).slice(0, 1600) }); await p.screenshot({ path: path.join(out, `${results.length}-failure.png`), fullPage: true }); }
  writeFileSync(path.join(out, "results.json"), JSON.stringify({ base, realEmails: false, realAuthWrites: false, results }, null, 2));
}
try {
  for (const prefix of ["", "/staff"]) {
    const scope = prefix ? "Staff" : "Customer";
    const context = await browser.newContext({ serviceWorkers: "block" });
    let signupFail = true, recoverFail = true, signupRequests = 0, recoverRequests = 0;
    const p = await context.newPage();
    await context.routeWebSocket("**", socket => socket.close());
    await context.route("**/*", route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname.startsWith("/auth/")) {
        const action = url.pathname.split("/").at(-1);
        if (action === "signup") {
          signupRequests++;
          if (signupFail) { signupFail = false; return route.fulfill({ status: 503, json: { message: "Test signup unavailable", code: "unexpected_failure" } }); }
          const body = request.postDataJSON();
          assert.equal(body.data.role, prefix ? "staff" : "customer");
          if (!prefix) assert.equal(body.data.phone, "09123456789");
          return route.fulfill({ json: { id: "90000000-0000-4000-8000-000000000088", email: "forms@example.test", identities: [{ id: "fixture" }], user_metadata: body.data, app_metadata: {}, aud: "authenticated", created_at: new Date().toISOString() } });
        }
        if (action === "recover" || action === "resend") {
          recoverRequests++;
          if (recoverFail) { recoverFail = false; return route.fulfill({ status: 503, json: { message: "Test email unavailable" } }); }
          return route.fulfill({ json: {} });
        }
        return route.fulfill({ status: 401, json: { message: "No fixture session" } });
      }
      if (url.pathname.startsWith("/rest/v1/")) return route.fulfill({ json: [] });
      if (url.pathname.includes("/api/")) return route.fulfill({ json: { items: [], acknowledged: false, configured: false } });
      if (url.origin === base) return route.continue();
      return route.abort();
    });
    try {
      await p.goto(base + prefix + "/register");
      await p.locator(prefix ? "#staff-name" : "#reg-name").fill("Audit Test Member");
      await p.locator(prefix ? "#staff-email" : "#reg-email").fill("forms@example.test");
      if (!prefix) await p.locator("#reg-phone").fill("0912 345 6789");
      await p.locator(prefix ? "#staff-password" : "#reg-password").fill("FixturePass1");
      await p.locator(prefix ? "#staff-confirm" : "#reg-confirm").fill("OtherPass1");
      if (!prefix) await p.getByRole("checkbox").check();
      if (!prefix) {
        await check("Customer: missing phone blocks registration without an Auth request", async () => {
          const phone = p.locator("#reg-phone"); await phone.fill("");
          await p.locator("form button[type=submit], form button:not([type])").click();
          await expect(phone).toBeFocused();
          assert.equal(await phone.evaluate(input => (input as HTMLInputElement).validity.valueMissing), true);
          assert.equal(signupRequests, 0);
        }, p);
        await check("Customer: malformed phone blocks registration without an Auth request", async () => {
          await p.locator("#reg-phone").fill("bad-phone");
          await p.locator("form button[type=submit], form button:not([type])").click();
          await expect(p.getByText("Enter a valid phone number so the delivery rider can contact you.", { exact: true })).toBeVisible();
          assert.equal(signupRequests, 0);
        }, p);
        await p.locator("#reg-phone").fill("0912 345 6789");
      }
      await check(scope + ": mismatched registration passwords block request", async () => {
        await p.locator("form button[type=submit], form button:not([type])").click();
        await expect(p.getByText(/Passwords do not match/)).toBeVisible();
        assert.equal(signupRequests, 0);
      }, p);
      await p.locator(prefix ? "#staff-confirm" : "#reg-confirm").fill("FixturePass1");
      await check(scope + ": registration failure retains fields", async () => {
        await p.locator("form button[type=submit], form button:not([type])").click();
        await expect(p.getByText(/Test signup unavailable|try again|could not/i).first()).toBeVisible();
        await expect(p.locator("input[type=email]")).toHaveValue("forms@example.test");
        assert.equal(signupRequests, 1);
      }, p);
      await check(scope + ": successful signup goes to email verification", async () => {
        await p.locator("form button[type=submit], form button:not([type])").click();
        await p.waitForURL(new RegExp(prefix + "/check-email"));
        assert.equal(signupRequests, 2);
      }, p);
      await p.goto(base + prefix + "/forgot-password");
      await p.locator("input[type=email]").fill("forms@example.test");
      await check(scope + ": recovery failure retains email", async () => {
        await p.locator("form button[type=submit], form button:not([type])").click();
        await expect(p.getByText(/Test email unavailable|could not|try again/i).first()).toBeVisible();
        await expect(p.locator("input[type=email]")).toHaveValue("forms@example.test");
        assert.equal(recoverRequests, 1);
      }, p);
      await check(scope + ": recovery retry goes to check-email", async () => {
        await p.locator("form button[type=submit], form button:not([type])").click();
        await p.waitForURL(new RegExp(prefix + "/check-email\\?"));
        assert.equal(new URL(p.url()).searchParams.get("type"), "reset");
        assert.equal(recoverRequests, 2);
      }, p);
      if (!prefix) await check("Customer: recovery resend has a cooldown", async () => {
        const resend = p.getByRole("button", { name: "Resend reset email", exact: true });
        await resend.click();
        await expect(p.getByText(/Email requested/)).toBeVisible();
        const before = recoverRequests;
        await resend.click();
        assert.equal(recoverRequests, before);
        await expect(p.getByText(/wait a minute/i)).toBeVisible();
      }, p);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ checks: results.length, failures: results.filter(r => r.status === "FAIL"), output: out }));
process.exitCode = results.some(r => r.status === "FAIL") ? 1 : 0;
