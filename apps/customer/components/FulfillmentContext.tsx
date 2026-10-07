"use client";
import { useEffect, useState } from "react";
import { useCart } from "../context/CartContext";
import Icon from "./Icon";

export default function FulfillmentContext() {
  const { orderType, setOrderType } = useCart();
  const [branch, setBranch] = useState({ name: "Jayds Café", address: "" });
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/branch", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!controller.signal.aborted && data?.name)
          setBranch({ name: data.name, address: data.address || "" });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return (
    <section
      className="portrait-only menu-fulfillment"
      aria-label="Ordering location"
    >
      <div className="segmented-control">
        {(["pickup", "delivery"] as const).map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={orderType === type}
            className={orderType === type ? "is-selected" : ""}
            onClick={() => setOrderType(type)}
          >
            <Icon name={type === "pickup" ? "bag" : "truck"} size={19} />
            {type === "pickup" ? "Pickup" : "Delivery"}
          </button>
        ))}
      </div>
      <details className="menu-branch">
        <summary>
          <Icon name="pin" size={17} />
          <span>{branch.name}</span>
          <Icon name="chevronRight" size={15} />
        </summary>
        <p>
          {branch.address ||
            "Your pickup branch. Delivery destinations are selected at checkout."}
        </p>
      </details>
    </section>
  );
}
