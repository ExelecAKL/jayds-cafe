"use client";
import Link from "next/link";
import { useCart } from "../context/CartContext";
import Icon from "./Icon";
export default function FloatingCartBar() {
  const { hydrated, itemCount, total } = useCart();
  if (!hydrated || itemCount < 1) return null;
  return (
    <div className="floating-bag">
      <Link href="/cart" className="floating-bag-button">
        <span key={itemCount} className="bag-count jm-pop">
          {itemCount}
        </span>
        <span className="flex-1 text-left">
          <strong className="block text-sm">View your bag</strong>
          <small className="text-white/80">
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </small>
        </span>
        <strong>₱{total.toFixed(2)}</strong>
        <Icon name="arrowRight" size={20} />
      </Link>
    </div>
  );
}
