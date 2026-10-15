export interface MenuOption {
  variant_group: string;
  label: string;
  price_modifier: number;
  is_default?: boolean;
  is_available?: boolean;
}
export const optionKey = (v: MenuOption) =>
  v.variant_group === "add_on" ? `add_on:${v.label}` : v.variant_group;
function groupOptions<T extends MenuOption>(options: T[]): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const value of options) (groups[value.variant_group] ??= []).push(value);
  return groups;
}
/** Preserve deliberate choices; never replace a missing default with a paid upgrade. */
export function resolveMenuDefaults<T extends MenuOption>(
  options: T[],
  previous: MenuOption[] = [],
): T[] {
  const groups = groupOptions(options);
  const chosen: T[] = [];
  for (const [group, values] of Object.entries(groups)) {
    const available = values!.filter((v) => v.is_available !== false);
    const retained = available.filter((v) =>
      previous.some(
        (p) => optionKey(p) === optionKey(v) && p.label === v.label,
      ),
    );
    if (group === "add_on") {
      chosen.push(...retained);
      continue;
    }
    const value =
      retained[0] ??
      (values!.some((v) => v.is_default)
        ? available.find((v) => v.is_default)
        : available.find((v) => Number(v.price_modifier) === 0));
    if (value) chosen.push(value);
  }
  const temperature = chosen.find(
    (v) => v.variant_group === "temperature",
  )?.label;
  const sizes = (groups.size ?? []).filter(
    (v) =>
      v.is_available !== false &&
      (temperature === "Hot"
        ? v.label.includes("12oz")
        : temperature === "Iced"
          ? !v.label.includes("12oz")
          : true),
  );
  const size = chosen.find((v) => v.variant_group === "size");
  if (groups.size && !sizes.includes(size as T)) {
    if (size) chosen.splice(chosen.indexOf(size), 1);
    const compatible =
      sizes.find((v) => v.is_default) ??
      sizes.find((v) => Number(v.price_modifier) === 0);
    if (compatible) chosen.push(compatible);
  }
  return chosen;
}
export function validateMenuDefaults(options: MenuOption[]): string | null {
  if (
    new Set(options.map((v) => `${v.variant_group}:${v.label.trim()}`)).size !==
    options.length
  )
    return "Each option label must be unique within its group.";
  for (const [group, values] of Object.entries(groupOptions(options))) {
    if (group === "add_on") {
      if (values!.some((v) => v.is_default))
        return "Add-ons are optional and cannot be selected by default.";
      continue;
    }
    if (values!.filter((v) => v.is_default).length !== 1)
      return `Choose exactly one default for ${group.replaceAll("_", " ")}.`;
    if (
      group === "milk_sub" &&
      !values!.some(
        (v) =>
          v.is_default &&
          v.label === "Whole Milk" &&
          Number(v.price_modifier) === 0,
      )
    )
      return "Milk choices need Whole Milk as the included, zero-price default.";
  }
  return null;
}
