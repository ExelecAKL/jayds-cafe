import type { Locator } from "@playwright/test";

export async function selectAdminOption(
  locator: Locator,
  selection: string | { label?: string; value?: string },
) {
  if (await locator.evaluate((element) => element.tagName === "SELECT"))
    return locator.selectOption(selection);
  const control = locator.and(locator.page().getByRole("combobox"));
  await control.click();
  const popupId = await control.getAttribute("aria-controls");
  if (!popupId) throw new Error("The Admin listbox did not open");
  const options = locator
    .page()
    .locator(`[id="${popupId}"]`)
    .getByRole("option");
  const label = typeof selection === "object" ? selection.label : undefined;
  if (label) await options.filter({ hasText: label }).click();
  else {
    const value = typeof selection === "string" ? selection : selection.value;
    const option = locator.page().locator(`[id="${popupId}"] [data-value]`);
    const matches = await option.evaluateAll(
      (nodes, value) =>
        nodes.findIndex((node) => node.getAttribute("data-value") === value),
      value,
    );
    if (matches < 0) throw new Error(`No Admin option with value ${value}`);
    await options.nth(matches).click();
  }
}
