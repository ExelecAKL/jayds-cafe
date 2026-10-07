import type { IconName } from "../components/Icon";
// Category line art is a transparent fallback, never a substitute product photo.
export function categoryIcon(name: string): IconName {
  if (/cookie/i.test(name)) return "cookie";
  if (/pastr|bread|croissant|croffle/i.test(name)) return "pastry";
  if (/chocolate|cocoa/i.test(name)) return "chocolate";
  if (/tea|matcha/i.test(name)) return "leaf";
  if (/cake|dessert/i.test(name)) return "cake";
  if (/food|breakfast|treat|snack|fries/i.test(name)) return "food";
  if (/frapp|refresh|iced|chocolate|juice/i.test(name)) return "cup";
  return "coffee";
}
