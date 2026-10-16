import LogoArtwork from "./LogoArtwork";
export function BrandMark() {
  return (
    <div className="jayds-brand-mark" aria-hidden="true">
      <LogoArtwork />
    </div>
  );
}
export default function BrandLoader({
  label,
  indicator = true,
}: {
  label?: string;
  indicator?: boolean;
}) {
  return (
    <div
      className="brand-loader"
      role="status"
      aria-live="polite"
      aria-label={label || "Loading Jayds Café"}
    >
      <BrandMark />
      {label && <p>{label}</p>}
      {indicator && (
        <span className="brand-loading-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
    </div>
  );
}
