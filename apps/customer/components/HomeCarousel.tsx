"use client";
import { useEffect, useRef, useState } from "react";
import Link from "./OfflineMenuLink";
import type { MenuItem } from "@cafeos/shared/types";
import {
  menuProductImageUrl,
  menuProductImageSrcSet,
} from "@cafeos/shared/utils/product-images";
import Icon from "./Icon";
import LogoArtwork from "./LogoArtwork";
export default function HomeCarousel({ products }: { products: MenuItem[] }) {
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false),
    [reducedMotion, setReducedMotion] = useState(false);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const pointerHeld = useRef(false);
  const slides = [
    { id: "welcome", item: null },
    ...products.slice(0, 2).map((item) => ({ id: item.id, item })),
  ];
  const current = Math.min(index, slides.length - 1),
    item = slides[current].item;
  const imageUrl = menuProductImageUrl(item?.id, item?.image_url);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    queueMicrotask(update);
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (paused || hovered || focused || reducedMotion || slides.length < 2)
      return;
    const timer = setInterval(() => {
      if (!document.hidden && !pointerHeld.current)
        setIndex((value) => (value + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [paused, hovered, focused, reducedMotion, slides.length]);
  function select(next: number) {
    setPaused(true);
    setIndex((next + slides.length) % slides.length);
  }
  return (
    <section
      className="home-carousel"
      aria-label="Featured at Jayds"
      aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={(event) => {
        pointerHeld.current = true;
        suppressClick.current = false;
        if (!(event.target as Element).closest(".carousel-playback"))
          setPaused(true);
        if (
          event.isPrimary &&
          event.pointerType !== "mouse" &&
          !(event.target as Element).closest("button")
        ) {
          gesture.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
        }
      }}
      onPointerMove={(event) => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = Math.abs(event.clientX - start.x),
          dy = Math.abs(event.clientY - start.y);
        if (
          dx > 16 &&
          dx > dy * 1.5 &&
          !event.currentTarget.hasPointerCapture(event.pointerId)
        )
          event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        pointerHeld.current = false;
        const start = gesture.current;
        gesture.current = null;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x,
          dy = event.clientY - start.y;
        if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          suppressClick.current = true;
          select(current + (dx < 0 ? 1 : -1));
        }
      }}
      onPointerCancel={() => {
        pointerHeld.current = false;
        gesture.current = null;
      }}
      onLostPointerCapture={(event) => {
        // Touch starts with implicit capture on a child. Its transfer to this
        // section bubbles a lost-capture event and must not cancel the swipe.
        if (event.target === event.currentTarget) {
          pointerHeld.current = false;
          gesture.current = null;
        }
      }}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDragStart={(event) => event.preventDefault()}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocused(false);
      }}
    >
      <div
        className="home-carousel-slide"
        key={slides[current].id}
        role="group"
        aria-roledescription="slide"
        aria-label={`${current + 1} of ${slides.length}`}
      >
        <div className="home-carousel-copy">
          <p className="home-carousel-eyebrow">
            {item ? "On the menu at Jayds" : "Made for your everyday"}
          </p>
          <h2>
            {item ? (
              item.name
            ) : (
              <>
                Your usual,
                <br />
                your way.
              </>
            )}
          </h2>
          <p className="home-carousel-description">
            {item
              ? item.description || "A café favorite, made your way."
              : "Fresh favorites and little treats, made with care at Jayds."}
          </p>
          {item && (
            <p
              className={`home-carousel-price${item.is_available ? "" : " price-unavailable"}`}
            >
              {(item.variants ?? []).some((v) => Number(v.price_modifier) !== 0)
                ? (item.variants ?? []).some(
                    (v) => Number(v.price_modifier) < 0,
                  )
                  ? "Base "
                  : "From "
                : ""}
              ₱{Number(item.price).toFixed(2)}
              {!item.is_available && <span>Currently sold out</span>}
            </p>
          )}
          <Link
            href={item ? `/menu/browse/${item.id}` : "/menu/browse"}
            className="home-hero-link"
          >
            {item ? "View menu item" : "Explore the menu"}
            <Icon name="arrowRight" size={18} />
          </Link>
        </div>
        <div
          className={`home-carousel-art ${imageUrl ? "is-product" : "is-welcome"}`}
        >
          {item && imageUrl ? (
            <img
              src={imageUrl}
              srcSet={menuProductImageSrcSet(imageUrl)}
              alt={item.name}
              width={195}
              height={210}
              decoding="async"
              sizes="(max-width: 767px) 150px, 195px"
            />
          ) : (
            <LogoArtwork />
          )}
        </div>
      </div>
      <div className="home-carousel-controls">
        <div className="home-carousel-pagination">
          <button
            type="button"
            className="carousel-control"
            onClick={() => select(current - 1)}
            disabled={slides.length < 2}
            aria-label="Previous featured slide"
          >
            <Icon name="arrowLeft" size={18} />
          </button>
          <div className="carousel-dots">
            {slides.map((slide, position) => (
              <button
                type="button"
                key={slide.id}
                aria-label={`Show featured slide ${position + 1}${slide.item ? `: ${slide.item.name}` : ": Welcome to Jayds"}`}
                aria-pressed={current === position}
                onClick={() => select(position)}
              >
                <span />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="carousel-control"
            onClick={() => select(current + 1)}
            disabled={slides.length < 2}
            aria-label="Next featured slide"
          >
            <Icon name="arrowRight" size={18} />
          </button>
          <button
            type="button"
            className="carousel-playback"
            disabled={slides.length < 2 || reducedMotion}
            title={
              reducedMotion
                ? "Automatic slides are paused for reduced motion."
                : undefined
            }
            onClick={() => setPaused((value) => !value)}
            aria-label={
              paused ? "Play featured slides" : "Pause featured slides"
            }
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              {paused ? (
                <path d="m5 3 7 5-7 5Z" />
              ) : (
                <path d="M5 3v10M11 3v10" />
              )}
            </svg>
            <span className="sr-only">
              {paused ? "Play slides" : "Pause slides"}
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
