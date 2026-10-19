// Shown instantly while this screen's code loads; matches its layout.
import {
  ScreenSkeleton,
  OrderListSkeleton,
} from "../../../components/Skeletons";

export default function Loading() {
  return (
    <ScreenSkeleton>
      <OrderListSkeleton count={4} />
    </ScreenSkeleton>
  );
}
