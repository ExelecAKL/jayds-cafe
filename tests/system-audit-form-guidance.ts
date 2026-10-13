import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const hosted = process.env.JAYDS_AUDIT_CUSTOMER_URL;
const out = path.resolve(
  process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/defense-fixes-2026-10-13",
  "form-guidance",
);
mkdirSync(out, { recursive: true });
const servers: ChildProcess[] = [];
const bases = hosted
  ? [hosted, hosted + "/staff", hosted + "/admin"]
  : ["http://127.0.0.1:4340", "http://127.0.0.1:4341", "http://127.0.0.1:4342"];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: "block",
});
let signupRequests = 0;
await context.route("**/*", (route) =>
  ["GET", "HEAD", "OPTIONS"].includes(route.request().method())
    ? route.continue()
    : (() => { if (new URL(route.request().url()).pathname.endsWith("/auth/v1/signup")) signupRequests++; return route.abort(); })(),
);
const page = await context.newPage();
const results: { feature: string; status: string; detail: string }[] = [];
async function check(feature: string, work: () => Promise<void>) {
  try {
    await work();
    results.push({
      feature,
      status: "PASS",
      detail:
        "Rendered labels, marker colour, conditional guest requirement and phone layout; no account/email/order writes",
    });
  } catch (error) {
    results.push({
      feature,
      status: "FAIL",
      detail: String(error).slice(0, 1400),
    });
  }
  writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify(
      { checkedAt: new Date().toISOString(), bases, results },
      null,
      2,
    ),
  );
  console.log(results.at(-1)?.status, feature);
}
try {
  if (!hosted) {
    for (const [i, app] of ["customer", "pos", "admin"].entries())
      servers.push(
        spawn(
          process.execPath,
          [
            path.resolve("node_modules/next/dist/bin/next"),
            "start",
            "-p",
            String(4340 + i),
            "-H",
            "127.0.0.1",
          ],
          {
            cwd: path.resolve("apps", app),
            windowsHide: true,
            stdio: "ignore",
          },
        ),
      );
    for (const base of bases)
      for (let retry = 0; retry < 100; retry++) {
        try {
          if ((await fetch(base + "/login")).ok) break;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
  }
  for (const [app, routes] of [
    [0, ["/login", "/register", "/forgot-password"]],
    [1, ["/login", "/register", "/forgot-password"]],
    [2, ["/login"]],
  ] as const)
    for (const route of routes)
      await check(
        `${["Customer", "Staff", "Admin"][app]} ${route}: required and optional labels`,
        async () => {
          await page.goto(bases[app] + route);
          await page.locator(".startup-overlay").waitFor({ state: "detached" });
          await expect(
            page.locator('[data-field-requirement="required"]').first(),
          ).toBeVisible();
          const labels = await page.locator("label").evaluateAll((nodes) =>
            nodes.map((node) => ({
              text: node.textContent?.trim() || "",
              requirement: node
                .querySelector("[data-field-requirement]")
                ?.getAttribute("data-field-requirement"),
              color: node.querySelector("[data-field-requirement]")
                ? getComputedStyle(
                    node.querySelector("[data-field-requirement]")!,
                  ).color
                : "",
            })),
          );
          for (const label of labels) {
            assert.ok(
              label.requirement,
              `Label has explicit requirement: ${label.text}`,
            );
            if (label.requirement === "required")
              assert.equal(label.color, "rgb(185, 28, 28)");
            else assert.match(label.text, /\(optional\)/);
          }
          if (route === "/register")
            assert.equal(
              labels.find((label) => /Phone/i.test(label.text))?.requirement,
              app === 0 ? "required" : "optional",
            );
          const width = await page.evaluate(() => ({
            viewport: innerWidth,
            document: document.documentElement.scrollWidth,
          }));
          assert.ok(
            width.document <= width.viewport + 1,
            "Form fits phone width",
          );
          await page.screenshot({
            path: path.join(out, `${app}-${route.slice(1)}-phone.png`),
            fullPage: true,
          });
        },
      );
  await check(
    "Guest help: order ID is required; message and subject are required",
    async () => {
      await page.goto(bases[0] + "/help");
      await page.locator(".startup-overlay").waitFor({ state: "detached" });
      const label = page.locator('label[for="help-order"]');
      await expect(
        label.locator('[data-field-requirement="required"]'),
      ).toBeVisible();
      for (const id of ["help-subject", "help-message"])
        await expect(
          page.locator(
            `label[for="${id}"] [data-field-requirement="required"]`,
          ),
        ).toBeVisible();
    },
  );
  await check("Customer registration: blank and malformed phone cannot submit an account", async () => {
    await page.goto(bases[0] + "/register");
    await page.locator(".startup-overlay").waitFor({ state: "detached" });
    await page.locator("#reg-name").fill("Audit contact fixture");
    await page.locator("#reg-email").fill("phone@example.test");
    await page.locator("#reg-password").fill("FixturePass1");
    await page.locator("#reg-confirm").fill("FixturePass1");
    await page.getByRole("checkbox").check();
    await page.locator("form button[type=submit]").click();
    await expect(page.locator("#reg-phone")).toBeFocused();
    assert.equal(signupRequests, 0);
    await page.locator("#reg-phone").fill("bad-phone");
    await page.locator("form button[type=submit]").click();
    await expect(page.getByText("Enter a valid phone number so the delivery rider can contact you.", { exact: true })).toBeVisible();
    assert.equal(signupRequests, 0);
  });
} finally {
  await browser.close();
  for (const server of servers) server.kill();
}
process.exitCode = results.some((result) => result.status === "FAIL") ? 1 : 0;
