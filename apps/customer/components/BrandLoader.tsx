import Icon from "./Icon";
import LogoArtwork from "./LogoArtwork";
export function BrandMark() {
  return (
    <div className="jayds-brand-mark" aria-hidden="true">
      <LogoArtwork />
    </div>
  );
}
export default function BrandLoader({
  label = "Getting your café ready…",
}: {
  label?: string;
}) {
  return (
    <div className="brand-loader" role="status" aria-live="polite">
      <BrandMark />
      <span className="brand-loader-cup" aria-hidden="true">
        <Icon name="coffee" size={32} />
      </span>
      <p>{label}</p>
      <span className="brand-loading-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}
