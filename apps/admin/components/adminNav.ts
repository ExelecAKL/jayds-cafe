// apps/admin/components/adminNav.ts
// Single source of truth for Admin navigation: sidebar groups, topbar
// breadcrumbs, and the quick-jump palette all read from here.
import type { IconName } from "./Operations";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Extra words that should match this page in quick jump search. */
  keywords?: string;
};
export type NavGroup = { label: string; items: NavItem[] };

export const adminNavGroups: NavGroup[] = [
  {
    label: "Today",
    items: [
      {
        href: "/dashboard",
        label: "Café overview",
        icon: "overview",
        keywords: "home dashboard summary",
      },
      {
        href: "/orders",
        label: "Orders",
        icon: "orders",
        keywords: "tickets sales transactions",
      },
      {
        href: "/customer-care",
        label: "Customer help",
        icon: "support",
        keywords: "support requests refund payment courier",
      },
    ],
  },
  {
    label: "Menu",
    items: [
      {
        href: "/menu",
        label: "Menu & prices",
        icon: "catalog",
        keywords: "products items price publish",
      },
      {
        href: "/categories",
        label: "Menu categories",
        icon: "tag",
        keywords: "groups sections",
      },
      {
        href: "/vouchers",
        label: "Vouchers",
        icon: "ticket",
        keywords: "discount promo codes coupons",
      },
    ],
  },
  {
    label: "Stock",
    items: [
      {
        href: "/inventory",
        label: "Stock & recipes",
        icon: "stock",
        keywords: "inventory ingredients count waste forecast",
      },
      {
        href: "/purchasing",
        label: "Buy & receive stock",
        icon: "purchase",
        keywords: "suppliers purchase orders deliveries receiving",
      },
    ],
  },
  {
    label: "Reports",
    items: [
      {
        href: "/analytics",
        label: "Sales reports",
        icon: "reports",
        keywords: "analytics revenue margins best sellers",
      },
      {
        href: "/finance",
        label: "Finance & invoices",
        icon: "receipt",
        keywords: "invoices accounting expenses",
      },
      {href:"/export",label:"Export data",icon:"reports",keywords:"download csv json backup"},
    ],
  },
  {
    label: "People",
    items: [
      {
        href: "/staff-accounts",
        label: "Staff access",
        icon: "userCheck",
        keywords: "employees approve cashier",
      },
      {
        href: "/staff",
        label: "Account roles",
        icon: "people",
        keywords: "users customers admin role",
      },
      {
        href: "/loyalty",
        label: "Customer points",
        icon: "star",
        keywords: "loyalty members tiers rewards",
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        href: "/scheduling",
        label: "Hours & pickup",
        icon: "clock",
        keywords: "opening hours schedule branch closures",
      },
      {
        href: "/void-security",
        label: "Cancellation PIN",
        icon: "lock",
        keywords: "void security manager pin",
      },
      {
        href: "/audit",
        label: "Change history",
        icon: "history",
        keywords: "audit log activity",
      },
    ],
  },
];

export const adminNavItems = adminNavGroups.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.label })),
);

/** Exact segment match so `/staff` is not active on `/staff-accounts`. */
export function isNavActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function findNavItem(pathname: string) {
  return adminNavItems.find((item) => isNavActive(pathname, item.href));
}
