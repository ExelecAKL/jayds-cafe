// Shown instantly while this screen's code loads; matches its layout.
import {
  ScreenSkeleton,
  RewardsSkeleton,
} from "../../../components/Skeletons";

export default function Loading() {
  return (
    <ScreenSkeleton back>
      <RewardsSkeleton />
    </ScreenSkeleton>
  );
}
