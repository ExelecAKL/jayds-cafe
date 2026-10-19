import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { chromium, expect as playwrightExpect } from "@playwright/test";
import { base, isolateDashboard } from "./admin-dashboard-fixture.mjs";

const output = ".codex-logs/dashboard";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  colorScheme: "light",
});
const state = {
  empty: false,
  fail: false,
  ordersFail: false,
  delay: 0,
  periods: [] as number[],
};
const results: string[] = [];
const errors: string[] = [];
const diagnostics: string[] = [];
page.on("requestfailed", (req) =>
  diagnostics.push(
    `FAILED ${new URL(req.url()).pathname}: ${req.failure()?.errorText}`,
  ),
);
page.on("console", (message) => {
  if (message.type() === "error")
    diagnostics.push(message.text().slice(0, 500));
});
page.on("request", (req) => {
  const path = new URL(req.url()).pathname;
  diagnostics.push(`${req.method()} ${path}`);
});
const expect = playwrightExpect.configure({ timeout: 20_000 });
page.on("pageerror", (error) => errors.push(String(error)));
try {
  await isolateDashboard(page, state);
  await page.goto(base + "/dashboard");
  await expect(page.locator(".revenue-value")).toContainText("50,300");
  await expect(
    page
      .getByRole("table", { name: "Recent orders", exact: true })
      .locator("tbody tr"),
  ).toHaveCount(6);
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: output + "/desktop-light.png",
    fullPage: true,
  });
  results.push(
    "Live route renders verified metrics, six recent orders, stock alerts and purchasing links with isolated data.",
  );

  await page.getByRole("button", { name: "Dark mode", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".revenue-value")).toContainText("50,300");
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.screenshot({ path: output + "/desktop-dark.png", fullPage: true });
  results.push("Dark mode persists after reload.");

  await page.getByRole("button", { name: "Bar chart", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".chart-bar")).toHaveCount(7);
  await page.getByRole("button", { name: "Area chart", exact: true }).click();
  await expect(page.locator(".chart-line")).toHaveCount(1);
  await page.locator(".chart-data summary").focus();
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByRole("table", { name: "Daily sales", exact: true })
      .locator("tbody tr"),
  ).toHaveCount(7);
  await page.keyboard.press("Enter");
  results.push("Keyboard operates chart views and daily-data disclosure.");

  await page.getByRole("button", { name: "Last 30 days", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Export report", exact: true }),
  ).toBeEnabled();
  assert.ok(state.periods.includes(30));
  await expect(page.locator(".chart-point")).toHaveCount(30);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export report", exact: true })
    .click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "jayds-sales-30-days.csv");
  const downloadPath = await download.path();
  assert.equal(
    readFileSync(downloadPath!, "utf8").trim().split(/\r?\n/).length,
    31,
  );
  results.push(
    "Period selection requests 30 days and exports the matching 30-row CSV.",
  );
  await page.getByRole("button", { name: "Last 7 days", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Export report", exact: true }),
  ).toBeEnabled();

  state.delay = 900;
  await page
    .getByRole("button", { name: "Refresh dashboard", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Refresh dashboard", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Export report", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Refresh dashboard", exact: true }),
  ).toBeEnabled();
  state.delay = 0;
  state.fail = true;
  await page
    .getByRole("button", { name: "Refresh dashboard", exact: true })
    .click();
  await expect(page.locator(".dashboard-feedback[role=alert]")).toContainText(
    "Some data is unavailable",
  );
  await expect(page.locator("[data-admin-toasts] .admin-toast")).toContainText(
    "Some data is unavailable Sales could not load.",
  );
  await expect(
    page.getByRole("button", { name: "Export report", exact: true }),
  ).toBeDisabled();
  state.fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".dashboard-feedback[role=alert]")).toHaveCount(0);
  for (const dismiss of await page.getByRole("button", { name: "Dismiss notification", exact: true }).all()) {
    await dismiss.click();
  }
  results.push(
    "Refresh exposes busy/disabled states; failed sales keep prior figures, block export and recover through retry.",
  );

  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem("jayds-admin-theme", theme);
    }, theme);
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `No document overflow at ${width} in ${theme}`,
      );
    }
    await page.setViewportSize({ width: 375, height: 900 });
    await page.screenshot({
      path: `${output}/mobile-${theme}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(page.locator(".ops-sidebar")).toHaveClass(/open/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".ops-sidebar")).not.toHaveClass(/open/);
  await expect(
    page.getByRole("button", { name: "Open navigation", exact: true }),
  ).toBeFocused();
  results.push(
    "Both themes fit 320/375/768/1024/1440 viewports; mobile navigation supports Escape and restores focus.",
  );

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole("button", { name: "Jump to", exact: false }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "JAY-1042", exact: false }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  results.push(
    "Command palette and recent order details still open and close by keyboard.",
  );

  state.empty = true;
  await page.reload();
  await expect(
    page.getByText("No paid sales in this period", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Ready for your next order", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: output + "/empty.png", fullPage: true });
  state.fail = true;
  await page.reload();
  await expect(
    page.getByText("Sales are unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export report", exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: output + "/error.png", fullPage: true });
  results.push(
    "Empty and initial-error states show honest messages without fabricated sales or charts.",
  );
  await page.context().clearCookies();
  await page.goto(base + "/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeVisible();
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  // Measure final theme colors, not intermediate CSS transition frames.
  await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" });
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(async theme => {
      document.documentElement.dataset.theme = theme;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }, theme);
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<{ violations: { id: string; nodes: { target: string[]; failureSummary: string }[] }[] }> } }).axe;
        return (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, detail: n.failureSummary })) }));
      });
      assert.deepEqual(violations, [], `Login accessibility: ${theme}, ${width}`);
      await page.screenshot({ path: `${output}/login-${theme}-${width}.png`, fullPage: true });
    }
  }
  results.push("Administrator login fits mobile/desktop and passes axe in both themes.");
  assert.deepEqual(errors, []);
  writeFileSync(
    output + "/results.json",
    JSON.stringify(
      { passed: true, liveBusinessWrites: false, results, errors },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ dashboard: "PASS", checks: results }, null, 2));
} catch (error) {
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
  console.error({
    url: page.url(),
    errors,
    diagnostics: diagnostics.slice(-15),
    text: (await page.locator("body").innerText()).slice(0, 1500),
  });
  throw error;
} finally {
  await browser.close();
}
