// Shown instantly while this screen's code loads; matches its layout.
import {
  ScreenSkeleton,
  AddressGridSkeleton,
} from "../../../../components/Skeletons";

export default function Loading() {
  return (
    <ScreenSkeleton back>
      <AddressGridSkeleton />
    </ScreenSkeleton>
  );
}
