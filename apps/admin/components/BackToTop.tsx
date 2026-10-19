"use client";
// apps/admin/components/BackToTop.tsx
// A quiet return-to-top control for long tables and reports. It appears
// after more than a screen and a half of scrolling and returns focus to the
// page content so keyboard users continue from the top too.
import { useEffect, useState } from "react";
import { Icon } from "./Operations";

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setVisible(window.scrollY > window.innerHeight * 1.5),
      );
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <button
      type="button"
      className={`ops-back-to-top${visible ? " is-visible" : ""}`}
      aria-label="Back to top"
      title="Back to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      onClick={() => {
        const reduced = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
        document
          .getElementById("admin-content")
          ?.focus({ preventScroll: true });
      }}
    >
      <span className="ops-back-to-top-icon">
        <Icon name="arrow" size={18} />
      </span>
    </button>
  );
}
