"use client";
import { useState } from "react";
import type { MenuItem } from "@cafeos/shared/types";
import { useCustomerFavorites } from "../context/CustomerFeatures";
import { useCustomerToast } from "../context/CustomerToast";
import Icon from "./Icon";
export default function FavoriteButton({
  item,
  className = "",
}: {
  item: MenuItem;
  className?: string;
}) {
  const { isFavorite, toggle } = useCustomerFavorites();
  const notify = useCustomerToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = isFavorite(item.id);
  return (
    <div className={className}>
      <button
        type="button"
        className={`icon-button favorite-button ${selected ? "is-favorite" : ""}`}
        aria-label={`${selected ? "Remove" : "Save"} ${item.name} ${selected ? "from" : "to"} favorites`}
        aria-pressed={selected}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await toggle(item);
            notify(
              selected
                ? `${item.name} removed from favorites`
                : `${item.name} saved to favorites`,
              {
                icon: "heart",
                action: selected
                  ? undefined
                  : { label: "View", href: "/favorites" },
              },
            );
          } catch {
            setError("Could not save favorite. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Icon name="heart" />
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-error">
          {error}
        </p>
      )}
    </div>
  );
}
