// packages/shared/src/ui/skeleton.tsx
// Skeleton primitives shared by Customer, POS and Admin. Pair with
// skeleton.css and motion.css. Shapes are decorative; SkeletonStatus carries
// the accessible loading announcement for the whole placeholder.
import type { CSSProperties, ReactNode } from "react";

type Length = number | string;

/** Numbers are design pixels and become rem so placeholders scale with text. */
function length(value?: Length) {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value / 16}rem` : value;
}

export function Skeleton({
  width,
  height,
  radius,
  ratio,
  shape,
  inline = false,
  className = "",
  style,
}: {
  width?: Length;
  height?: Length;
  radius?: Length;
  /** Aspect ratio for media placeholders, for example "4 / 3". */
  ratio?: string;
  shape?: "text" | "title" | "circle" | "pill" | "block" | "media";
  inline?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const vars: Record<string, string | undefined> = {
    "--jsk-w": length(width),
    "--jsk-h": length(height),
    "--jsk-r": length(radius),
    "--jsk-ratio": ratio,
  };
  for (const key of Object.keys(vars)) if (!vars[key]) delete vars[key];
  return (
    <span
      aria-hidden="true"
      className={[
        "jsk",
        shape && shape !== "text" ? `jsk-${shape}` : "",
        inline ? "jsk-inline" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ...vars, ...style } as CSSProperties}
    />
  );
}

// Ragged right edges read as prose; identical bars read as a table.
const proseWidths = ["100%", "94%", "86%", "97%", "90%"];

export function SkeletonText({
  lines = 2,
  lastWidth = "62%",
  height,
  gap,
  className = "",
}: {
  lines?: number;
  lastWidth?: string;
  height?: Length;
  gap?: Length;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`jsk-lines ${className}`}
      style={gap === undefined ? undefined : ({ gap: length(gap) } as CSSProperties)}
    >
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          height={height}
          width={
            index === lines - 1 && lines > 1
              ? lastWidth
              : proseWidths[index % proseWidths.length]
          }
        />
      ))}
    </span>
  );
}

/**
 * Wraps a placeholder in one polite status region. The visible shapes are
 * hidden from assistive technology; the label is announced once. Pass a null
 * label when the placeholder sits inside another one, so only the outer
 * region announces.
 */
export function SkeletonStatus({
  label,
  children,
  className = "",
  as: Tag = "div",
  style,
}: {
  label: string | null;
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "span" | "li";
  style?: CSSProperties;
}) {
  if (label === null)
    return (
      <Tag aria-hidden="true" className={className} style={style}>
        {children}
      </Tag>
    );
  return (
    <Tag
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      className={`jsk-group ${className}`}
      style={style}
    >
      <span className="jsk-sr">{label}</span>
      {children}
    </Tag>
  );
}

/** Convenience for repeating a placeholder shape a fixed number of times. */
export function repeat<T>(count: number, render: (index: number) => T): T[] {
  return Array.from({ length: count }, (_, index) => render(index));
}
