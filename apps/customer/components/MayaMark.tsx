// apps/customer/components/MayaMark.tsx
// Maya's wordmark, shown wherever Maya is the payment method. The owner chose
// a white overlay of the wordmark instead of its mint colour, set on a dark
// ground so it stays legible on Jayds' cream surfaces.
export default function MayaMark({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const width = size === "sm" ? 44 : size === "lg" ? 84 : 60;
  return (
    <span className={`maya-mark maya-mark-${size} ${className}`}>
      <img
        src="/payments/maya-logo.png"
        alt="Maya"
        width={width}
        height={Math.round((width * 105) / 360)}
        decoding="async"
      />
    </span>
  );
}
