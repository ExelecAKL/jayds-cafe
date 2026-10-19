// Shown instantly while this screen's code loads; matches its layout.
import {
  ScreenSkeleton,
  MenuSectionsSkeleton,
} from "../../../../components/Skeletons";

export default function Loading() {
  return (
    <ScreenSkeleton>
      <MenuSectionsSkeleton label="Opening the menu" />
    </ScreenSkeleton>
  );
}
