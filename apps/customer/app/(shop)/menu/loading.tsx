// Shown instantly while this screen's code loads; matches its layout.
import {
  ScreenSkeleton,
  ProductGridSkeleton,
} from "../../../components/Skeletons";

export default function Loading() {
  return (
    <ScreenSkeleton>
      <ProductGridSkeleton count={4} label="Opening home" />
    </ScreenSkeleton>
  );
}
