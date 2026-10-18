"use client";
import { useState } from "react";
import Link from "./OfflineMenuLink";
import type { MenuItem, SelectedVariant } from "@cafeos/shared/types";
import {
  menuProductImageUrl,
  menuProductImageSrcSet,
} from "@cafeos/shared/utils/product-images";
import Icon from "./Icon";
import { categoryIcon } from "../utils/menuArtwork";
import { useOutletAvailability } from "../context/OutletAvailability";
function defaultConfiguration(item: MenuItem): SelectedVariant[] | null {
  const variants = (item.variants ?? []).filter(
    (v) => !v.applicable_items || v.applicable_items.includes(item.id),
  );
  const groups = [...new Set(variants.map((v) => v.variant_group))];
  const defaults = groups.map((group) =>
    variants.filter(
      (v) =>
        v.variant_group === group && v.is_default && v.is_available !== false,
    ),
  );
  if (defaults.some((group) => group.length !== 1)) return null;
  const selected = defaults.map((group) => group[0]);
  const temp = selected.find((v) => v.variant_group === "temperature")?.label;
  const size = selected.find((v) => v.variant_group === "size")?.label;
  if (
    size &&
    ((temp === "Hot" && !size.includes("12oz")) ||
      (temp === "Iced" && size.includes("12oz")))
  )
    return null;
  return selected.map(({ variant_group, label, price_modifier }) => ({
    variant_group,
    label,
    price_modifier: Number(price_modifier),
  }));
}
export default function MenuCard({
  item,
  className = "",
  action,
  configuration,
  displayPrice,
  reason,
}: {
  item: MenuItem;
  className?: string;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  configuration?: SelectedVariant[];
  displayPrice?: number;
  reason?: string;
}) {
  const { canSelect } = useOutletAvailability();
  function guard(event: React.MouseEvent) {
    if (!canSelect()) event.preventDefault();
  }
  const defaults = configuration ?? defaultConfiguration(item);
  const imageUrl = menuProductImageUrl(item.id, item.image_url);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const price =
    displayPrice ??
    Number(item.price) +
      (defaults?.reduce((sum, v) => sum + v.price_modifier, 0) ?? 0);
  return (
    <article
      className={`product-card${item.is_available ? "" : " is-sold-out"} ${className}`}
    >
      <div className="product-art">
        <Link
          href={`/menu/browse/${item.id}`}
          className="product-image-link"
          aria-label={`View ${item.name}`}
          onClick={guard}
        >
          {imageUrl && imageUrl !== failedImage ? (
            <img
              src={imageUrl}
              srcSet={menuProductImageSrcSet(imageUrl)}
              sizes="(max-width: 600px) 45vw, (max-width: 1024px) 28vw, 230px"
              alt={item.name}
              loading="lazy"
              decoding="async"
              onError={() => setFailedImage(imageUrl)}
              width={320}
              height={320}
              className="product-image"
            />
          ) : (
            <div className="product-placeholder">
              <Icon
                name={categoryIcon(item.category?.name || item.name)}
                size={55}
              />
              <span>JAYDS CAFÉ</span>
            </div>
          )}
        </Link>
        {!item.is_available && <span className="sold-out-label">Sold out</span>}
      </div>
      <div className="product-copy">
        <Link href={`/menu/browse/${item.id}`} onClick={guard}>
          <h3 className="product-name">{item.name}</h3>
        </Link>
        {item.description && (
          <p className="product-description">{item.description}</p>
        )}
        {reason && <p className="product-reason">{reason}</p>}
        {defaults && defaults.length > 0 && (
          <p className="product-configuration">
            {defaults.map((v) => v.label).join(" · ")}
          </p>
        )}
        <div className="product-footer">
          <span
            className={`product-price${item.is_available ? "" : " price-unavailable"}`}
          >
            {!defaults && (item.variants?.length ?? 0) > 0 ? "From " : ""}₱
            {price.toFixed(2)}
          </span>
          {action ? (
            <button
              type="button"
              className="product-select"
              onClick={() => {
                if (canSelect()) action.onClick();
              }}
              disabled={action.disabled}
              aria-label={`${action.label} ${item.name}`}
            >
              {action.label}
              <Icon name="chevronRight" size={16} />
            </button>
          ) : (
            <Link
              href={`/menu/browse/${item.id}`}
              className="product-select"
              aria-label={`${item.is_available ? "Select" : "View details for"} ${item.name}`}
              onClick={guard}
            >
              {item.is_available ? "Select" : "Details"}
              <Icon name="chevronRight" size={16} />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
