import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

export async function adminControlJourneys(page: Page, base: string) {
  const checks: string[] = [];
  const auditDialog = async () => {
    await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<{ violations: { id: string; nodes: { target: string[]; failureSummary: string }[] }[] }> } }).axe;
      return (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, detail: n.failureSummary })) }));
    });
    assert.deepEqual(violations, [], "Open form and listbox accessibility");
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/menu");
  const filter = page.getByRole("combobox", { name: "Publication filter" });
  await filter.focus();
  await page.keyboard.press("ArrowDown");
  await expect(filter).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(filter).toHaveAttribute("data-value", "archived");
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(filter).toHaveAttribute("data-value", "all");
  await page.keyboard.press("p");
  await expect(filter).toHaveAttribute("data-value", "active");
  await filter.click();
  await page.keyboard.press("Escape");
  await expect(filter).toBeFocused();
  await expect(filter).toHaveAttribute("aria-expanded", "false");
  checks.push("Combobox arrows, Home/End, typeahead, Enter and Escape operate the real product filter.");

  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { localStorage.setItem("jayds-admin-theme", theme); document.documentElement.dataset.theme = theme; }, theme);
    await page.getByRole("button", { name: "Add product", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const category = dialog.getByRole("combobox", { name: /^Category/ });
    await category.click();
    const popupId = await category.getAttribute("aria-controls");
    const list = page.locator(`[id="${popupId}"]`);
    await expect(list).toBeVisible();
    assert.equal(await list.evaluate(node => Boolean(node.closest('[role="dialog"]'))), true, "Popup remains in its modal accessibility tree");
    await auditDialog();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(category).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
  checks.push("Product forms and expanded listboxes pass axe in both themes; Escape closes the list before the form.");

  await page.goto(base + "/inventory");
  const tabs = page.getByRole("tablist", { name: "Inventory sections" });
  await tabs.getByRole("tab", { name: /Stock items/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Recipes", exact: true })).toBeFocused();
  await expect(tabs.getByRole("tab", { name: "Recipes", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(tabs.getByRole("tab", { name: "Stock planning", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(tabs.getByRole("tab", { name: /Stock items/ })).toBeFocused();
  checks.push("Inventory tabs support roving keyboard focus and select the matching content.");
  writeFileSync(".codex-logs/admin-ui/controls.json", JSON.stringify({ liveBusinessWrites: false, checks }, null, 2));
  console.log(JSON.stringify({ adminControls: "PASS", checks }));
  return checks;
}
