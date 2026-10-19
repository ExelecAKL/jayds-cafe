import type { SVGProps, ReactNode } from "react";
import { BrandIcon, type BrandIconName } from "@cafeos/shared/brand";

export type IconName =
  | "warning"
  | "info"
  | "home"
  | "menu"
  | "orders"
  | "user"
  | "coffee"
  | "cup"
  | "leaf"
  | "cake"
  | "grid"
  | "pastry"
  | "chocolate"
  | "cookie"
  | "food"
  | "heart"
  | "bag"
  | "truck"
  | "pin"
  | "bell"
  | "arrowRight"
  | "arrowLeft"
  | "chevronRight"
  | "search"
  | "close"
  | "check"
  | "star"
  | "help"
  | "shield"
  | "wallet"
  | "clock"
  | "settings"
  | "logout"
  | "plus"
  | "minus";
const paths: Record<IconName, ReactNode> = {
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 3.8a2 2 0 0 1 3.4 0l8 14A2 2 0 0 1 20 21H4a2 2 0 0 1-1.7-3.2Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  food: (
    <>
      <circle cx="13" cy="12" r="7" />
      <path d="M2 3v6c0 2 3 2 3 0V3M3.5 3v18M22 3v18M22 3c-4 2-4 7 0 7" />
    </>
  ),
  cup: (
    <>
      <path d="M5 7h14l-2 14H7ZM4 7h16M6 4h12M13 4l2-3" />
      <path d="M9 12h6M10 16h4" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 3C9 2 3 7 5 14c2 7 13 5 15-11Z" />
      <path d="M3 21 16 8M9 15l-1-5M13 11l4 1" />
    </>
  ),
  cake: (
    <>
      <path d="M3 12h18v9H3ZM3 16c3 3 3-3 6 0s3-3 6 0 3-3 6 0M6 12V8h12v4M9 8V5M15 8V5" />
      <path d="M9 2v1M15 2v1" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  pastry: (
    <>
      <path d="M3 10 7 5l5-2 5 2 4 5-3 10-6-3-6 3ZM7 5l2 13M17 5l-2 13M12 3v14" />
    </>
  ),
  chocolate: (
    <>
      <path d="M5 3h14v18H5ZM5 9h14M5 15h14M12 3v12" />
      <path d="m5 17 3-2 8 6" />
    </>
  ),
  cookie: (
    <>
      <path d="M21 12a9 9 0 1 1-9-9c0 3 2 4 4 4 0 3 2 5 5 5Z" />
      <circle cx="8" cy="9" r=".7" />
      <circle cx="8" cy="16" r=".7" />
      <circle cx="14" cy="15" r=".7" />
      <circle cx="12" cy="11" r=".7" />
    </>
  ),
  home: (
    <>
      <path d="m3 10 9-7 9 7v10H3Z" />
      <path d="M9 20v-8h6v8" />
    </>
  ),
  menu: (
    <>
      <path d="M4 4h16v16H4Z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  orders: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  coffee: (
    <>
      <path d="M4 8h13v7a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6Z" />
      <path d="M17 9h2a3 3 0 0 1 0 6h-2M7 3v2M11 2v3M15 3v2" />
    </>
  ),
  heart: (
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
  ),
  bag: (
    <>
      <path d="M5 7h14l1 14H4Z" />
      <path d="M8 8V6a4 4 0 0 1 8 0v2" />
    </>
  ),
  truck: (
    <>
      <path d="M2 5h12v12H2ZM14 9h4l4 4v4h-8" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </>
  ),
  arrowRight: <path d="M4 12h16m-7-7 7 7-7 7" />,
  arrowLeft: <path d="M20 12H4m7-7-7 7 7 7" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="7.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m4 12 5 5L20 6" />,
  star: (
    <path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4L2.8 9.7l6.4-.9Z" />
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 8.5a2.5 2.5 0 0 1 5 .5c0 2-2.5 2-2.5 4M12 17h.01" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 8H4a2 2 0 0 1 0-4h14v4M4 8H3v12h17V8" />
      <path d="M20 12h-5v4h5M17 14h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="8" cy="7" r="2" />
      <circle cx="16" cy="17" r="2" />
    </>
  ),
  logout: (
    <>
      <path d="M9 3H4v18h5M10 12h11m-5-5 5 5-5 5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
};
export default function Icon({
  name,
  size = 22,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  const brandIcons: Partial<Record<IconName, BrandIconName>> = {
    coffee: "cup",
    cup: "cup",
    bag: "bag",
    truck: "delivery",
    orders: "orders",
    wallet: "rewards",
    help: "support",
  };
  const brandName = brandIcons[name];
  if (brandName) return <BrandIcon name={brandName} size={size} {...props} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
