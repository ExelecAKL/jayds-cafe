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
    const signupRedirects: (string | null)[] = [];
    const emailRedirects: (string | null)[] = [];
    const exchanges: { auth_code?: string; code_verifier?: string }[] = [];
    let confirmedSession = false;
    let surveySignup = false;
    const fixtureUser = { id: "90000000-0000-4000-8000-000000000088", email: "forms@example.test", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: new Date().toISOString() };
    function fixtureSession() {
      const expires=Math.floor(Date.now()/1000)+3600;
      const jwt=[Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url"),Buffer.from(JSON.stringify({sub:fixtureUser.id,exp:expires,aud:"authenticated",role:"authenticated"})).toString("base64url"),"fixture-signature"].join(".");
      return {access_token:jwt,refresh_token:"fixture-refresh",token_type:"bearer",expires_in:3600,user:fixtureUser};
    }
    const p = await context.newPage();
    await context.routeWebSocket("**", socket => socket.close());
    await context.route("**/*", route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname.startsWith("/auth/")) {
        const action = url.pathname.split("/").at(-1);
        if (action === "token" && url.searchParams.get("grant_type") === "pkce") {
          exchanges.push(request.postDataJSON());
          confirmedSession = true;
          const expires = Math.floor(Date.now() / 1000) + 3600;
          const jwt = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: fixtureUser.id, exp: expires, aud: "authenticated", role: "authenticated" })).toString("base64url"), "fixture-signature"].join(".");
          return route.fulfill({ json: { access_token: jwt, refresh_token: "fixture-refresh", token_type: "bearer", expires_in: 3600, user: fixtureUser } });
        }
        if (action === "user" && confirmedSession) return route.fulfill({ json: fixtureUser });
        if (action === "signup") {
          signupRequests++;
          signupRedirects.push(url.searchParams.get("redirect_to"));
          if (signupFail) { signupFail = false; return prefix ? route.fulfill({ status: 503, json: { message: "Test signup unavailable", code: "unexpected_failure" } }) : route.fulfill({status:429,json:{message:"Email rate limit exceeded",code:"over_email_send_rate_limit"}}); }
          const body = request.postDataJSON();
          assert.equal(body.data.role, prefix ? "staff" : "customer");
          if (!prefix) assert.equal(body.data.phone, "09123456789");
          if(surveySignup){confirmedSession=true;return route.fulfill({json:fixtureSession()});}
          return route.fulfill({ json: { id: "90000000-0000-4000-8000-000000000088", email: "forms@example.test", identities: [{ id: "fixture" }], user_metadata: body.data, app_metadata: {}, aud: "authenticated", created_at: new Date().toISOString() } });
        }
        if (action === "recover" || action === "resend") {
          recoverRequests++;
          emailRedirects.push(url.searchParams.get("redirect_to"));
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
        await expect(p.getByText(/Test signup unavailable|try again|could not|Email requests/i).first()).toBeVisible();
        if(!prefix)await expect(p.getByText("Email requests are temporarily unavailable. Please try later or contact the café.",{exact:true})).toBeVisible();
        await expect(p.locator("input[type=email]")).toHaveValue("forms@example.test");
        assert.equal(signupRequests, 1);
      }, p);
      await check(scope + ": successful signup goes to email verification", async () => {
        await p.locator("form button[type=submit], form button:not([type])").click();
        await p.waitForURL(new RegExp(prefix + "/check-email"));
        assert.equal(signupRequests, 2);
        assert.deepEqual(signupRedirects, [base + prefix + "/login", base + prefix + "/login"]);
      }, p);
      if (!prefix) await check("Customer: verification resend returns to the same app", async () => {
        const request = p.waitForRequest(r => new URL(r.url()).pathname.endsWith("/auth/v1/resend"));
        recoverFail = false;
        await p.getByRole("button", { name: "Resend verification email", exact: true }).click();
        const sent = await request;
        assert.equal(new URL(sent.url()).searchParams.get("redirect_to"), base + "/login");
        await expect(p.getByText(/Email requested/)).toBeVisible();
        recoverRequests = 0;
        emailRedirects.length = 0;
        recoverFail = true;
      }, p);
      if (!prefix) await check("Customer: confirmation return exchanges PKCE and opens Home", async () => {
        await p.goto(base + "/login?code=isolated-confirmation-code");
        await p.waitForURL(base + "/menu");
        assert.equal(exchanges.length, 1);
        assert.equal(exchanges[0].auth_code, "isolated-confirmation-code");
        assert.ok(exchanges[0].code_verifier, "Confirmation keeps the signup browser's proof key");
        await context.clearCookies();
        confirmedSession = false;
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
        assert.deepEqual(emailRedirects, [base + prefix + "/reset-password", base + prefix + "/reset-password"]);
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
      if(!prefix)await check("Customer: survey signup enters Home immediately without a verification email",async()=>{
        surveySignup=true;
        await p.goto(base+"/register");
        await p.locator("#reg-name").fill("Survey Fixture Member");await p.locator("#reg-email").fill("forms@example.test");await p.locator("#reg-phone").fill("09123456789");
        await p.locator("#reg-password").fill("FixturePass1");await p.locator("#reg-confirm").fill("FixturePass1");await p.getByRole("checkbox").check();
        await p.locator("form button[type=submit], form button:not([type])").click();await p.waitForURL(base+"/menu");
        assert.equal(signupRequests,3);
      },p);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ checks: results.length, failures: results.filter(r => r.status === "FAIL"), output: out }));
process.exitCode = results.some(r => r.status === "FAIL") ? 1 : 0;
