"use client";
import Link from "../../../components/OfflineMenuLink";
import { useMenu } from "@cafeos/shared/hooks/useMenu";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useCustomerFavorites } from "../../../context/CustomerFeatures";
import AppShell, {
  EmptyState,
  InlineNotice,
} from "../../../components/AppShell";
import MenuCard from "../../../components/MenuCard";
export default function FavoritesPage() {
  const { menuItems, loading: menuLoading } = useMenu();
  const { user } = useAuth();
  const { items, isFavorite, loading, error, remove } = useCustomerFavorites();
  const products = menuItems.filter((item) => isFavorite(item.id));
  const unavailable = items.filter(
    (entry) => !menuItems.some((p) => p.id === entry.menu_item_id),
  );
  return (
    <AppShell
      title="Saved for your next visit."
      eyebrow="Favorites"
      backHref="/menu/browse"
      cart
    >
      {!user && (
        <InlineNotice>
          These favorites are saved on this device.{" "}
          <Link className="text-link" href="/login">
            Sign in for account favorites
          </Link>
        </InlineNotice>
      )}
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      {unavailable.length > 0 && (
        <InlineNotice>
          {unavailable.length} saved product
          {unavailable.length === 1 ? " is" : "s are"} outside the current
          published menu. Available favorites are shown below.
          {unavailable.map((entry, index) => <button key={entry.menu_item_id + index} className="btn-secondary mt-3 min-h-12" onClick={() => void remove(entry)}>Remove unavailable favorite {index + 1}</button>)}
        </InlineNotice>
      )}
      {loading || menuLoading ? (
        <div className="product-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-72" />
          ))}
        </div>
      ) : products.length ? (
        <div className="product-grid">
          {products.map((item) => (
            <MenuCard item={item} key={item.id} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="heart"
          title="Keep the good ones close."
          description="Tap the heart on a product to save it for your next coffee run."
          action={
            <Link className="btn-primary" href="/menu/browse">
              Explore the menu
            </Link>
          }
        />
      )}
    </AppShell>
  );
}
