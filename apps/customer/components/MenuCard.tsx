"use client";
import { useState } from "react";
import Link from "./OfflineMenuLink";
import type { MenuItem, SelectedVariant } from "@cafeos/shared/types";
import { menuProductImageUrl } from "@cafeos/shared/utils/product-images";
import FavoriteButton from "./FavoriteButton";
import Icon from "./Icon";
import { categoryIcon } from "../utils/menuArtwork";
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
}: {
  item: MenuItem;
  className?: string;
}) {
  const defaults = defaultConfiguration(item);
  const imageUrl = menuProductImageUrl(item.id, item.image_url);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const price =
    Number(item.price) +
    (defaults?.reduce((sum, v) => sum + v.price_modifier, 0) ?? 0);
  return (
    <article className={`product-card ${className}`}>
      <div className="product-art">
        <Link
          href={`/menu/browse/${item.id}`}
          className="product-image-link"
          aria-label={`View ${item.name}`}
        >
          {imageUrl && imageUrl !== failedImage ? (
            <img
              src={imageUrl}
              alt={item.name}
              loading="lazy"
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
        <FavoriteButton item={item} className="absolute right-2 top-2" />
        {!item.is_available && <span className="sold-out-label">Sold out</span>}
      </div>
      <div className="product-copy">
        <Link href={`/menu/browse/${item.id}`}>
          <h3 className="product-name">{item.name}</h3>
        </Link>
        {item.description && (
          <p className="product-description">{item.description}</p>
        )}
        {defaults && defaults.length > 0 && (
          <p className="product-configuration">
            {defaults.map((v) => v.label).join(" · ")}
          </p>
        )}
        <div className="product-footer">
          <span className="product-price">
            {!defaults && (item.variants?.length ?? 0) > 0 ? "From " : ""}₱
            {price.toFixed(2)}
          </span>
          <Link
            href={`/menu/browse/${item.id}`}
            className="product-select"
            aria-label={`${item.is_available ? "Select" : "View details for"} ${item.name}`}
          >
            {item.is_available ? "Select" : "Details"}
            <Icon name="chevronRight" size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}
