"use client";
import Link from "next/link";
import { Drawer } from "./Operations";
import { ColorMeanings } from "./StatusSemantics";

type Guide = {
  title: string;
  purpose: string;
  steps: string[];
  remember: string;
  next: [string, string][];
};
export const adminGuides: Record<string, Guide> = {
  dashboard: {
    title: "Café overview",
    purpose: "Start here to see what needs attention today.",
    steps: [
      "Check active orders and stock alerts.",
      "Choose an everyday task below, or use the navigation on the left.",
      "Use Sales reports for a longer period or a downloadable report.",
    ],
    remember:
      "Sales collected counts paid orders. An unpaid order is not money received.",
    next: [
      ["/orders", "Check orders"],
      ["/inventory?filter=low", "Check low stock"],
    ],
  },
  notifications: {
    title: "Notifications",
    purpose:
      "See everything that needs a decision: blocked orders, payment checks, stock alerts, help requests and staff waiting for access.",
    steps: [
      "Start with Needs attention. Red items block service; amber items need a decision today.",
      "Select an alert to open the page where you can resolve it. Opening it marks it as read.",
      "Use the switches to choose which alerts count on the bell on this device.",
      "Shortcuts: Shift + N opens notifications, Ctrl + K jumps to a page, ? opens help, / searches the page.",
    ],
    remember:
      "Marking an alert as read only changes this list. Low stock or a blocked order stays an alert until it is resolved on its page.",
    next: [
      ["/inventory?filter=low", "Check low stock"],
      ["/customer-care", "Reply to customers"],
    ],
  },
  orders: {
    title: "Orders",
    purpose: "Review customer and counter orders in one place.",
    steps: [
      "Search an order number or filter by order status.",
      "Open a ticket to see payment, items, and pickup or delivery details.",
      "Use the staff POS to prepare orders, scan pickup codes, and arrange riders.",
    ],
    remember:
      "Payment and order progress are separate. Ready does not mean collected or delivered.",
    next: [
      ["/customer-care", "Resolve a customer issue"],
      ["/audit", "Review change history"],
    ],
  },
  scheduling: {
    title: "Hours & pickup",
    purpose:
      "Set the café's opening hours and how many scheduled pickups it can handle.",
    steps: [
      "Check the branch details, weekly hours, and full-day closures.",
      "Set how many orders and items can fit in each 15-minute pickup window.",
      "Save your settings. Read the setup checks before enabling scheduled pickup.",
    ],
    remember:
      "Scheduled pickup needs verified stock recipes and opening counts. Changing hours can affect which times customers can book.",
    next: [
      ["/inventory?setup=1", "Check stock setup"],
      ["/customer-care", "Review online-order setup"],
    ],
  },
  "customer-care": {
    title: "Customer help",
    purpose:
      "Handle private customer requests and investigate payment or delivery problems.",
    steps: [
      "Open a request and read the customer's message before replying.",
      "For a payment or courier problem, check the order and provider reference first.",
      "Use the recovery tools only when the reference belongs to that exact order.",
    ],
    remember:
      "Provider recovery checks an existing transaction. It must not invent a paid status or a completed delivery.",
    next: [
      ["/orders", "Find the customer's order"],
      ["/scheduling", "Check hours & pickup"],
    ],
  },
  menu: {
    title: "Menu & prices",
    purpose: "Manage the products customers and cashiers can order.",
    steps: [
      "Add a product or choose Edit beside an existing one.",
      "Check its price, options, stock recipe, and publishing settings.",
      "Save, then check the product in the customer menu and POS.",
    ],
    remember:
      "Saved prices and options affect future orders across the apps. Archiving hides a product; accepted tickets keep their recorded details.",
    next: [
      ["/categories", "Organize menu categories"],
      ["/inventory", "Review stock recipes"],
    ],
  },
  categories: {
    title: "Menu categories",
    purpose: "Group products so customers and cashiers can find them.",
    steps: [
      "Add a category and choose its display order.",
      "Use Edit to rename or change its visibility.",
      "Read the confirmation before archiving or deleting a category.",
    ],
    remember:
      "Archiving a category also archives its products. Restoring the category does not automatically restore those products.",
    next: [["/menu", "Manage products"]],
  },
  vouchers: {
    title: "Discount vouchers",
    purpose: "Set when and how customers can use a discount code.",
    steps: [
      "Create a unique code and choose a percentage or fixed amount.",
      "Check the minimum spend, expiry, and usage limit.",
      "Enable the voucher when it is ready; pause it when you want to stop new uses.",
    ],
    remember:
      "The checkout checks eligibility again when the customer places an order. A visible code alone does not guarantee a discount.",
    next: [["/orders", "Check a discounted order"]],
  },
  inventory: {
    title: "Stock & recipes",
    purpose: "Track ingredients, packaging, and the stock each product uses.",
    steps: [
      "Add stock items in their smallest unit, such as grams, milliliters, or pieces.",
      "Receive deliveries, record waste, or enter a physical count after checking the actual stock.",
      "Connect product recipes and option requirements. Use Stock planning to decide what to buy.",
    ],
    remember:
      "On hand is physical stock. Reserved is held for accepted orders. Available is what can still be sold. A physical count replaces the recorded quantity; a receipt adds to it.",
    next: [
      ["/purchasing", "Buy & receive stock"],
      ["/menu", "Review product recipes"],
    ],
  },
  purchasing: {
    title: "Buy & receive stock",
    purpose: "Plan supplier orders and record what actually arrives.",
    steps: [
      "Add a supplier, then create a purchase draft with the items needed.",
      "Review and approve it. Mark it ordered after sending it to the supplier.",
      "Choose Receive and enter only the quantities physically delivered.",
    ],
    remember:
      "A draft or approval does not add stock. Receiving adds stock; undelivered quantities stay outstanding. Previously received stock is not removed when a purchase is cancelled.",
    next: [["/inventory", "Check stock on hand"]],
  },
  analytics: {
    title: "Sales reports",
    purpose: "Understand sales and stock costs for a chosen period.",
    steps: [
      "Choose the reporting period.",
      "Compare collected sales, popular products, and estimated margins.",
      "Export the report when you need a copy.",
    ],
    remember:
      "Margins depend on recorded ingredient costs and recipes. Check those records before treating an estimate as your final profit.",
    next: [
      ["/inventory", "Check costs & recipes"],
      ["/orders", "Review source orders"],
    ],
  },
  "staff-accounts": {
    title: "Staff access",
    purpose:
      "Approve employee requests and manage access to the staff and owner screens.",
    steps: [
      "Verify the person's identity before approving a pending request.",
      "Give cashiers Staff access; give trusted managers Admin access only when needed.",
      "Choose Customer to remove staff access while keeping their customer account.",
    ],
    remember:
      "Admin access can change prices, stock, and other accounts. Your own role is locked here to help prevent an accidental lockout.",
    next: [
      ["/staff", "View all account roles"],
      ["/void-security", "Set the cancellation PIN"],
    ],
  },
  staff: {
    title: "Account roles",
    purpose:
      "See all users, including customers, and choose which area each account can access.",
    steps: [
      "Find the correct name and email.",
      "Choose Customer, Staff, or Admin and review the confirmation.",
      "Use Staff access to approve a pending employee request.",
    ],
    remember:
      "Changing a role is an access decision, not a name change. Your current Admin role cannot be changed from this page.",
    next: [["/staff-accounts", "Review staff access"]],
  },
  loyalty: {
    title: "Customer points",
    purpose:
      "Review loyalty balances and correct a customer's points when necessary.",
    steps: [
      "Search for the customer and check their current balance.",
      "Enter a whole-number adjustment: positive adds points, negative removes points.",
      "Review the resulting balance before saving.",
    ],
    remember:
      "This changes the customer's current points balance. A correction cannot reduce it below zero.",
    next: [["/orders", "Check the customer's order"]],
  },
  "void-security": {
    title: "Cancellation PIN",
    purpose: "Control who can authorize order cancellation at the POS.",
    steps: [
      "Set or change the six-digit manager PIN.",
      "Share it only with staff authorized to cancel orders.",
      "Review cancellation attempts in the log below.",
    ],
    remember:
      "Cancelling a paid order does not automatically refund its payment. Prepared ingredients are not automatically restored.",
    next: [
      ["/orders", "Review an order"],
      ["/audit", "Check change history"],
    ],
  },
  audit: {
    title: "Change history",
    purpose: "Review recorded system actions and who performed them.",
    steps: [
      "Filter by the type of action or user.",
      "Check the timestamp and affected record.",
      "Open the relevant page if you need to investigate further.",
    ],
    remember: "This page is a history view. It does not undo an action.",
    next: [
      ["/orders", "Check orders"],
      ["/staff-accounts", "Review staff access"],
    ],
  },
};

export function AdminHelp({
  page,
  onClose,
}: {
  page: string;
  onClose: () => void;
}) {
  const guide = adminGuides[page] ?? adminGuides.dashboard;
  return (
    <Drawer
      title={`Help: ${guide.title}`}
      description={guide.purpose}
      onClose={onClose}
    >
      <div className="ops-page-guide">
        <h3>What to do</h3>
        <ol>
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="ops-form-summary">
          <strong>Before you continue</strong>
          <p>{guide.remember}</p>
        </div>
        <h3>What colours mean</h3>
        <p className="ops-help-note">
          Every status in the back office uses the same colours, always with an
          icon and a word.
        </p>
        <ColorMeanings />
        <h3>Related tasks</h3>
        <div className="ops-guide-links">
          {guide.next.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="ops-button"
              onClick={onClose}
            >
              {label} →
            </Link>
          ))}
        </div>
      </div>
    </Drawer>
  );
}
