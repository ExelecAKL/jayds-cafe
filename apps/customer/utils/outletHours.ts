import type { CustomerBranch } from "@cafeos/shared/customer/types";

// Same-day, nonoverlapping opening windows are enforced by branch settings.
export function outletIsOpen(
  branch: Pick<CustomerBranch, "hours" | "closures"> | null,
  now = new Date(),
): boolean | null {
  if (!branch || !Array.isArray(branch.hours) || !branch.hours.length)
    return null;
  const local = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const date = local.toISOString().slice(0, 10),
    weekday = local.getUTCDay();
  if (branch.closures?.includes(date)) return false;
  const time = local.toISOString().slice(11, 19);
  return branch.hours.some(
    (h) =>
      h.weekday === weekday &&
      time >= `${h.opens.slice(0, 5)}:00` &&
      time < `${h.closes.slice(0, 5)}:00`,
  );
}
