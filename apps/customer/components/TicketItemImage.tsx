"use client";
import { useState } from "react";
import {
  menuProductImageUrl,
  menuProductImageSrcSet,
} from "@cafeos/shared/utils/product-images";
import Icon from "./Icon";

export default function TicketItemImage({
  menuItemId,
  imageUrl,
  name,
}: {
  menuItemId: string | null;
  imageUrl?: string | null;
  name: string;
}) {
  const src = menuProductImageUrl(menuItemId ?? "", imageUrl);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-bg-primary">
      {src && failed !== src ? (
        <img
          src={src}
          srcSet={menuProductImageSrcSet(src)}
          sizes="56px"
          alt={name}
          width={56}
          height={56}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
          onError={() => setFailed(src)}
        />
      ) : (
        <span
          role="img"
          aria-label={`No photo for ${name}`}
          className="text-text-secondary"
        >
          <Icon name="bag" size={24} />
        </span>
      )}
    </div>
  );
}
