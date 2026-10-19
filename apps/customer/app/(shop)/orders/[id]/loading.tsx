// Shown instantly while this screen's code loads; matches its layout.
import {
  ScreenSkeleton,
  OrderDetailSkeleton,
} from "../../../../components/Skeletons";

export default function Loading() {
  return (
    <ScreenSkeleton back>
      <OrderDetailSkeleton />
    </ScreenSkeleton>
  );
}
