import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, type Browser, type Locator } from "@playwright/test";
const user = {
  id: "90000000-0000-4000-8000-000000000090",
  email: "password-fixture@example.test",
  aud: "authenticated",
  role: "authenticated",
  created_at: "2026-10-16T00:00:00Z",
  user_metadata: {},
  app_metadata: { provider: "email" },
};
export async function passwordJourneys(
  browser: Browser,
  urls: { customer: string; pos: string; admin: string },
) {
  const results: {
    scope: string;
    path: string;
    fields: number;
    status: string;
  }[] = [];
  for (const scope of ["customer", "pos", "admin"] as const) {
    for (const signedIn of scope === "customer" ? [false, true] : [false]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
      });
      let mutations = 0;
      const errors: string[] = [];
      await context.routeWebSocket("**", (socket) => socket.close());
      const base = urls[scope],
        host = new URL(base).hostname;
      if (signedIn)
        await context.addCookies([
          {
            name: `sb-${scope}-auth-token`,
            value: encodeURIComponent(
              JSON.stringify({
                access_token: "password-browser-fixture",
                refresh_token: "fixture",
                expires_in: 3600,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
                token_type: "bearer",
                user,
              }),
            ),
            domain: host,
            path: "/",
          },
        ]);
      await context.route("**/*", (route) => {
        const req = route.request(),
          url = new URL(req.url());
        if (url.pathname.startsWith("/auth/")) {
          if (req.method() !== "GET") {
            mutations++;
            return route.fulfill({
              status: 409,
              json: { message: "Unexpected password test mutation" },
            });
          }
          return route.fulfill(
            signedIn
              ? { json: { ...user, user } }
              : { status: 401, json: { message: "No fixture session" } },
          );
        }
        if (url.pathname.startsWith("/rest/"))
          return route.fulfill({
            json: url.pathname.endsWith("/profiles")
              ? [
                  {
                    id: user.id,
                    role: "customer",
                    full_name: "Password Fixture",
                    phone: "09123456789",
                    is_approved: true,
                    points: 0,
                  },
                ]
              : [],
          });
        if (
          url.origin === new URL(base).origin &&
          url.pathname.includes("/api/")
        )
          return route.fulfill({
            json: {
              acknowledged: true,
              configured: false,
              items: [],
              notifications: [],
              favorites: [],
              branch: null,
            },
          });
        if (url.origin === new URL(base).origin) return route.continue();
        return route.abort();
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        const cases = signedIn
          ? [
              {
                path: "/profile/edit",
                ids: [
                  "profile-current-password",
                  "profile-new-password",
                  "profile-confirm-password",
                ],
              },
              {
                path: "/reset-password",
                ids: ["new-password", "confirm-new-password"],
              },
            ]
          : scope === "customer"
            ? [
                { path: "/login", ids: ["login-password"] },
                { path: "/register", ids: ["reg-password", "reg-confirm"] },
              ]
            : scope === "pos"
              ? [
                  { path: "/login", ids: ["password"] },
                  {
                    path: "/register",
                    ids: ["staff-password", "staff-confirm"],
                  },
                ]
              : [{ path: "/login", ids: ["password"] }];
        for (const entry of cases) {
          await page.goto(base + entry.path);
          for (const id of entry.ids) {
            const input = page.locator(`#${id}`);
            await expect(input).toBeVisible();
            await exercise(input);
            assert.equal(
              mutations,
              0,
              "Visibility buttons must never submit credentials",
            );
          }
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            true,
            `${scope}${entry.path} phone overflow`,
          );
          results.push({
            scope,
            path: entry.path,
            fields: entry.ids.length,
            status: "PASS",
          });
        }
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    }
  }
  mkdirSync(".codex-logs/password-audit", { recursive: true });
  writeFileSync(
    ".codex-logs/password-audit/browser-results.json",
    JSON.stringify(
      { fixtureOnly: true, actualAuthWrites: false, results },
      null,
      2,
    ),
  );
  console.log(
    `Password visibility: ${results.reduce((n, r) => n + r.fields, 0)} fields across Customer, POS and Admin passed pointer/keyboard, masking, value preservation and no-submit checks.`,
  );
}
async function exercise(input: Locator) {
  const wrapper = input.locator(".."),
    toggle = wrapper.getByRole("button");
  await expect(input).toHaveAttribute("type", "password");
  await input.fill("FixturePass1");
  await expect(wrapper.getByRole('button')).toHaveCount(1);
  if(process.env.JAYDS_BROWSER_CHANNEL==='msedge')
    assert.equal(await input.evaluate(el=>getComputedStyle(el,'::-ms-reveal').display),'none','Edge native reveal is suppressed alongside the single app control');
  await toggle.click();
  await expect(input).toHaveAttribute("type", "text");
  await expect(input).toHaveValue("FixturePass1");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toHaveAttribute(
    "aria-controls",
    (await input.getAttribute("id"))!,
  );
  const box = await toggle.boundingBox();
  assert.ok(box && box.width >= 44 && box.height >= 44);
  await toggle.focus();
  await toggle.press("Space");
  await expect(input).toHaveAttribute("type", "password");
  await expect(input).toHaveValue("FixturePass1");
  await toggle.press("Space");
  await expect(input).toHaveAttribute("type", "text");
  await input.focus();
  await input.fill("");
  await expect(input).toHaveAttribute("type", "password");
  await input.fill("FixturePass1");
  await expect(input).toHaveAttribute("type", "password");
  await toggle.click();
  await toggle.focus();
  await toggle.press("Tab");
  await expect(input).toHaveAttribute("type", "password");
}
