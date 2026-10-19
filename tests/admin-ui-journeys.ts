import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

export async function installAdminVisualFixtures(
  page: Page,
  menu: Record<string, unknown>[],
) {
  await page.route(
    /\/rest\/v1\/rpc\/(admin_sales_report|finance_report|invoice_email_status|admin_export_catalog)(?:\?|$)/,
    async (route) => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1);
      const sales = {
        revenue: 3500,
        orders: 35,
        previous_revenue: 2800,
        start: "2026-10-12T00:00:00+08:00",
        end: "2026-10-18T23:59:59+08:00",
        chart: Array.from({ length: 7 }, (_, i) => ({
          label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i],
          revenue: [250, 400, 600, 450, 700, 500, 600][i],
          orders: 5,
        })),
        best_sellers: menu
          .slice(0, 10)
          .map((m, i) => ({
            item_key: m.id,
            name: m.name,
            qty: 30 - i,
            revenue: 1000 - i * 30,
          })),
        heatmap: Array.from({ length: 7 }, () =>
          Array.from({ length: 24 }, (_, i) => (i > 7 && i < 19 ? i % 6 : 0)),
        ),
        margins: menu.map((m) => ({
          id: m.id,
          name: m.name,
          price: 100,
          cost: 30,
          profit: 70,
          margin: 70,
        })),
      };
      const finance = {
        net_sales: 312500,
        output_vat: 37500,
        collections: 350000,
        delivery: 0,
        delivery_income: 0,
        delivery_tax_pending: 0,
        cogs: 95000,
        operating_expenses: 40000,
        input_vat: 0,
        purchase_input_vat: 0,
        stock_writeoffs: 0,
        stock_writeoff_cost_unknown: 0,
        vat_balance: 37500,
        inventory_value: 180000,
        purchases: [],
        operating_profit: 177500,
        historical_tax_unknown: 0,
        historical_cost_unknown: 0,
        pending_invoices: 0,
        unconsumed_paid_orders: 0,
        ytd_osd_gross_sales: 312500,
        ytd_historical_tax_unknown: 0,
        ytd_delivery_tax_pending: 0,
        daily: [{ business_date: "2026-10-18", net_sales: 312500, vat: 37500 }],
        invoices: [],
        expenses: [],
        settings: {
          registered_name: "Jayds Café",
          trade_name: "Jayds Café",
          tin: "",
          branch_code: "000",
          registered_address: "Fixture address",
          invoices_enabled: false,
          authority_basis: "manual",
          invoice_prefix: "JAY",
          next_invoice: 1,
          compliance_verified: false,
          authorization_reference: null,
          authorization_date: null,
          registered_serial_start: null,
          registered_serial_end: null,
          delivery_tax_treatment: "pending",
          other_taxable_income: 0,
          income_tax_credits: 0,
          income_setup_confirmed: false,
          tax_year: 2026,
        },
      };
      await route.fulfill({
        json:
          name === "admin_sales_report"
            ? sales
            : name === "finance_report"
              ? finance
              : name === "invoice_email_status"
                ? {
                    enabled: false,
                    provider_ready: false,
                    sent: 0,
                    review: 0,
                    pending: 0,
                  }
                : {
                    tables: [
                      {
                        table_name: "orders",
                        section: "Orders & sales",
                        count: 35,
                      },
                      {
                        table_name: "menu_items",
                        section: "Food & stock",
                        count: menu.length,
                      },
                      {
                        table_name: "profiles",
                        section: "People & support",
                        count: 47,
                      },
                    ],
                  },
      });
    },
  );
}

export async function adminVisualJourneys(page: Page, base: string) {
  const output = ".codex-logs/admin-ui";
  mkdirSync(output, { recursive: true });
  const routes = [
    "dashboard",
    "orders",
    "menu",
    "categories",
    "vouchers",
    "inventory",
    "purchasing",
    "analytics",
    "finance",
    "export",
    "customer-care",
    "staff-accounts",
    "staff",
    "loyalty",
    "scheduling",
    "void-security",
    "audit",
  ];
  const results: {
    route: string;
    theme: string;
    width: number;
    overflow: number;
    violations?: unknown[];
  }[] = process.env.JAYDS_UI_RESUME === "1" && existsSync(`${output}/results.json`)
    ? JSON.parse(readFileSync(`${output}/results.json`, "utf8")).results
    : [];
  if (!page.url().startsWith(base)) await page.goto(base + "/dashboard", { waitUntil: "domcontentloaded", timeout: 60_000 });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      localStorage.setItem("jayds-admin-theme", theme);
    }, theme);
    for (const route of routes) {
      const measured = results.filter(row => row.route === route && row.theme === theme);
      if (measured.length === 2 && measured.every(row => row.overflow <= 1 && !row.violations?.length)) continue;
      for (let index = results.length - 1; index >= 0; index--) if (results[index].route === route && results[index].theme === theme) results.splice(index, 1);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`${base}/${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await expect(page.locator(".admin-shell")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      assert.equal(
        await page.locator("h1").count(),
        1,
        `${route} has a single page heading`,
      );
      await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
      const violations = await page.evaluate(async () => {
        const axe = (
          window as unknown as {
            axe: {
              run: (
                document: Document,
                options: unknown,
              ) => Promise<{
                violations: {
                  id: string;
                  impact: string;
                  nodes: { target: string[]; failureSummary: string }[];
                }[];
              }>;
            };
          }
        ).axe;
        return (
          await axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
          })
        ).violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            detail: n.failureSummary,
          })),
        }));
      });
      for (const width of [1440, 375]) {
        await page.setViewportSize({ width, height: 1000 });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        );
        results.push({
          route,
          theme,
          width,
          overflow,
          ...(width === 1440 ? { violations } : {}),
        });
        await page.screenshot({
          path: `${output}/${route}-${theme}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
      }
      writeFileSync(
        `${output}/results.json`,
        JSON.stringify({ liveBusinessWrites: false, results }, null, 2),
      );
      console.log(`UI ${route} ${theme}: ${violations.length} axe violations`);
    }
  }
  const failures = results.filter(
    (row) => row.overflow > 1 || row.violations?.length,
  );
  assert.deepEqual(
    failures,
    [],
    "Every Admin page fits mobile/desktop and has no automated axe violations in either theme",
  );
  return {
    routes: routes.length,
    renderedStates: results.length,
    violations: 0,
  };
}
