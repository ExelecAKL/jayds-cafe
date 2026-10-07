'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, useOperations } from './Operations';
const titles: Record<string, string> = {
  dashboard: 'Overview',
  orders: 'Orders',
  menu: 'Menu catalog',
  categories: 'Categories',
  inventory: 'Inventory',
  purchasing: 'Purchasing',
  analytics: 'Reports',
  vouchers: 'Vouchers',
  'staff-accounts': 'Staff accounts',
  loyalty: 'Members',
  'void-security': 'Void security',
  audit: 'Activity log',
};
export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const ops = useOperations();
  const alerts = ops.stock.filter(
    (item) => Number(item.available_stock) <= Number(item.min_stock_alert),
  ).length;
  return (
    <header className="ops-topbar">
      <div className="ops-topbar-left">
        <button
          className="ops-icon-button ops-mobile-menu"
          aria-label="Open navigation"
          onClick={onMenu}
        >
          <Icon name="menu" />
        </button>
        <span className="ops-breadcrumb">
          Back office <span>/</span>{' '}
          <strong>
            {titles[
              pathname.split('/').filter(Boolean).at(-1) ?? 'dashboard'
            ] ?? 'Management'}
          </strong>
        </span>
      </div>
      <div className="ops-topbar-right">
        <span className="ops-branch">
          {ops.settings?.branch_name ?? 'Jayds Café · Main branch'}
        </span>
        <span
          className={`ops-connection ${ops.connected && !ops.error ? 'online' : ''}`}
        >
          <i />
          {ops.error
            ? 'Setup required'
            : ops.connected
              ? 'Live'
              : 'Reconnecting'}
        </span>
        <Link
          href="/inventory?filter=low"
          className="ops-alert-button"
          aria-label={`${alerts} stock alerts`}
        >
          <Icon name="bell" />
          {alerts > 0 && <b>{alerts}</b>}
        </Link>
      </div>
    </header>
  );
}
