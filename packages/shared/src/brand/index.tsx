import type { SVGProps } from "react";
import dimensions from "./dimensions.json";
import shapes from "./shapes.json";

export type BrandVariant = keyof typeof dimensions;
export type BrandIconName = keyof typeof shapes;

export function BrandArtwork({
  variant = "full",
  tone = "ink",
  className,
  alt = "",
  preload = false,
}: {
  variant?: BrandVariant;
  tone?: "ink" | "cream";
  className?: string;
  alt?: string;
  preload?: boolean;
}) {
  const { width, height } = dimensions[variant];
  return (
    // Original vector artwork has fixed intrinsic proportions in every app.
    <img
      src={`/brand/jayds-${variant}${tone === "cream" ? "-cream" : ""}.svg`}
      width={width}
      height={height}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      className={className}
      decoding="async"
      fetchPriority={preload ? "high" : "auto"}
      loading={preload ? "eager" : "lazy"}
    />
  );
}

export function BrandIcon({
  name,
  size = 24,
  ...props
}: SVGProps<SVGSVGElement> & { name: BrandIconName; size?: number }) {
  const paths = shapes[name] as {
    d: string;
    fill?: string;
    stroke?: string;
    fillRule?: "evenodd";
    transform?: string;
  }[];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths.map((path, index) => (
        <path key={index} {...path} />
      ))}
    </svg>
  );
}
