import { BrandArtwork } from "@cafeos/shared/brand";

// Use the approved transparent vector directly at its natural proportions.
export default function LogoArtwork() {
  return (
    <span className="original-logo-frame" aria-hidden="true">
      <BrandArtwork variant="full" preload className="original-logo-image" />
    </span>
  );
}
