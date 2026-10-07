"use client";
import { useEffect, useState } from "react";
import Link from "../../../components/OfflineMenuLink";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMenu } from "@cafeos/shared/hooks/useMenu";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useOrders } from "@cafeos/shared/hooks/useOrders";
import { useCart } from "../../../context/CartContext";
import { useCustomerFavorites } from "../../../context/CustomerFeatures";
import AppShell, { InlineNotice } from "../../../components/AppShell";
import MenuCard from "../../../components/MenuCard";
import Icon from "../../../components/Icon";
import HomeCarousel from "../../../components/HomeCarousel";

export default function HomePage() {
  const router = useRouter();
  const { menuItems, featuredItems, loading, error, refetch } = useMenu();
  const { user, profile, initialized } = useAuth();
  const { orderType, setOrderType } = useCart();
  const favorites = useCustomerFavorites();
  const { orders } = useOrders({
    customerId: user?.id,
    enabled: initialized && !!user,
    includeCustomer: false,
    itemMode: "count",
    limit: 10,
  });
  const [branch, setBranch] = useState<{
    name: string;
    address?: string;
    delivery_radius_km?: number;
  }>({ name: "Jayds Café" });
  useEffect(() => {
    let active = true;
    void fetch("/api/branch")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.name) setBranch(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const activeOrder = orders.find(
    (o) => !["completed", "cancelled"].includes(o.status) && !o.is_parked,
  );
  const recommended = featuredItems.length
    ? featuredItems.slice(0, 4)
    : menuItems.slice(0, 4);
  const favoriteProducts = menuItems
    .filter((item) => favorites.isFavorite(item.id))
    .slice(0, 4);
  const name = profile?.full_name?.trim().split(/\s+/)[0];
  return (
    <AppShell
      title={name ? `Hello, ${name}.` : "A little cup of happy."}
      eyebrow="Welcome to Jayds"
      className="customer-home"
      cart
      actions={
        <Link
          href="/notifications"
          className="icon-button"
          aria-label="Notifications"
        >
          <Icon name="bell" />
        </Link>
      }
    >
      <div className="branch-strip">
        <Icon name="pin" size={18} />
        <div>
          <strong>{branch.name}</strong>
          {branch.address && <span className="ml-2">{branch.address}</span>}
        </div>
      </div>
      <div className="portrait-only home-quick-links">
        <Link href={user ? "/rewards" : "/register"}>
          <Icon name="star" size={22} />
          <span>
            <small>
              {user ? profile?.loyalty_tier || "Jayds member" : "Jayds rewards"}
            </small>
            <strong>
              {user
                ? `${(profile?.points ?? 0).toLocaleString()} points`
                : "Join the routine"}
            </strong>
          </span>
          <Icon name="chevronRight" size={16} />
        </Link>
        <Link href="/favorites">
          <Icon name="heart" size={21} />
          <span>
            <small>Made for you</small>
            <strong>Favorites</strong>
          </span>
        </Link>
      </div>
      {error && (
        <InlineNotice>
          Menu updates are unavailable.{" "}
          {menuItems.length
            ? "You can browse the saved catalog; availability is confirmed online."
            : "Please reconnect to load the menu."}
          <button className="text-link ml-2" onClick={() => void refetch()}>
            Retry
          </button>
        </InlineNotice>
      )}
      {activeOrder && (
        <Link href={`/orders/${activeOrder.id}`} className="order-card mb-5">
          <div className="flex items-center gap-3">
            <span className="empty-icon !mb-0 !h-12 !w-12 !rounded-2xl">
              <Icon name={activeOrder.status === "ready" ? "bag" : "clock"} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {activeOrder.status === "ready"
                  ? activeOrder.order_type === "delivery"
                    ? "Your order is ready for dispatch"
                    : "Your order is ready to collect"
                  : activeOrder.payment_status !== "paid"
                    ? "Complete your order"
                    : "We have your order"}
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                {activeOrder.order_number} · View updates
              </p>
            </div>
            <Icon name="chevronRight" />
          </div>
        </Link>
      )}
      <div className="home-main-grid mb-7">
        <HomeCarousel products={recommended} />
        <div className="home-order-tools mt-5 space-y-4 lg:mt-0">
          <section>
            <h2 className="eyebrow !mb-3">How are you ordering?</h2>
            <div className="segmented-control">
              <button
                type="button"
                className={orderType === "pickup" ? "is-selected" : ""}
                aria-pressed={orderType === "pickup"}
                onClick={() => setOrderType("pickup")}
              >
                <Icon name="bag" size={19} />
                Pickup
              </button>
              <button
                type="button"
                className={orderType === "delivery" ? "is-selected" : ""}
                aria-pressed={orderType === "delivery"}
                onClick={() => setOrderType("delivery")}
              >
                <Icon name="truck" size={19} />
                Delivery
              </button>
            </div>
            <p className="mt-2 text-xs text-text-secondary">
              {orderType === "pickup"
                ? "Order from anywhere and collect at the café."
                : `Choose your delivery pin at checkout${branch.delivery_radius_km ? ` · within ${branch.delivery_radius_km} km` : ""}.`}
            </p>
          </section>
          <Link href={user ? "/rewards" : "/register"} className="wallet-strip">
            <span className="wallet-icon">
              <Icon name="star" />
            </span>
            <div className="flex-1">
              <p className="text-base font-semibold">
                {user
                  ? `${(profile?.points ?? 0).toLocaleString()} Jayds points`
                  : "A rewarding coffee routine"}
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                {user
                  ? `${profile?.loyalty_tier || "Member"} · Rewards & vouchers`
                  : "Create an account to earn rewards"}
              </p>
            </div>
            <Icon name="chevronRight" size={18} />
          </Link>
          <div className="flex gap-3">
            <Link
              href="/favorites"
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-bg-card text-sm"
            >
              <Icon name="heart" size={18} />
              Favorites
            </Link>
            <Link
              href="/orders"
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-bg-card text-sm"
            >
              <Icon name="orders" size={18} />
              Order again
            </Link>
          </div>
        </div>
      </div>
      <section
        className="portrait-only home-order-choices"
        aria-label="Start your order"
      >
        <div className="section-heading">
          <h2 className="section-title">Your next coffee run</h2>
          <span className="text-xs text-text-secondary">Made your way</span>
        </div>
        <div className="home-fulfillment-cards">
          <Link href="/menu/browse" onClick={() => setOrderType("pickup")}>
            <span className="fulfillment-art">
              <Image
                src="/illustrations/jayds-pickup.svg"
                alt=""
                width={160}
                height={104}
                unoptimized
              />
            </span>
            <span>
              <strong>Pick it up</strong>
              <small>At your Jayds café</small>
            </span>
            <Icon name="arrowRight" size={18} />
          </Link>
          <Link href="/menu/browse" onClick={() => setOrderType("delivery")}>
            <span className="fulfillment-art">
              <Image
                src="/illustrations/jayds-delivery.svg"
                alt=""
                width={160}
                height={104}
                unoptimized
              />
            </span>
            <span>
              <strong>Bring it over</strong>
              <small>Pin your address at checkout</small>
            </span>
            <Icon name="arrowRight" size={18} />
          </Link>
        </div>
      </section>
      {!activeOrder && orders.find((o) => o.status === "completed") && (
        <Link
          className="portrait-only home-last-order"
          href={`/orders/${orders.find((o) => o.status === "completed")!.id}`}
        >
          <Icon name="orders" size={22} />
          <span>
            <small>Your last coffee run</small>
            <strong>
              {orders.find((o) => o.status === "completed")!.order_number}
            </strong>
          </span>
          <span className="text-link">
            Order again <Icon name="arrowRight" size={16} />
          </span>
        </Link>
      )}
      <section className="mb-8">
        <div className="section-heading">
          <h2 className="section-title">
            {featuredItems.length ? "Café favorites" : "Explore Jayds"}
          </h2>
          <Link href="/menu/browse" className="text-link">
            View menu
            <Icon name="arrowRight" size={17} />
          </Link>
        </div>
        {loading ? (
          <div className="product-grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-72 rounded-3xl" />
            ))}
          </div>
        ) : recommended.length ? (
          <div className="product-grid">
            {recommended.map((item) => (
              <MenuCard item={item} key={item.id} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">
            The published menu will appear here when it is available.
          </p>
        )}
      </section>
      {favoriteProducts.length > 0 && (
        <section className="mb-8">
          <div className="section-heading">
            <h2 className="section-title">Your saved favorites</h2>
            <Link href="/favorites" className="text-link">
              View all
              <Icon name="arrowRight" size={17} />
            </Link>
          </div>
          <div className="product-grid">
            {favoriteProducts.map((item) => (
              <MenuCard item={item} key={item.id} />
            ))}
          </div>
        </section>
      )}
      <button
        type="button"
        onClick={() => router.push("/help")}
        className="wallet-strip w-full text-left"
      >
        <span className="wallet-icon">
          <Icon name="help" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold">A hand with your order?</p>
          <p className="mt-1 text-xs text-text-secondary">
            Find answers and contact the café.
          </p>
        </div>
        <Icon name="chevronRight" size={18} />
      </button>
    </AppShell>
  );
}
