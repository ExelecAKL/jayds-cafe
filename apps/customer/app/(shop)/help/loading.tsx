// Shown instantly while this screen's code loads; matches its layout.
import {
  ScreenSkeleton,
  FormSkeleton,
} from "../../../components/Skeletons";

export default function Loading() {
  return (
    <ScreenSkeleton>
      <FormSkeleton fields={3} label="Opening help" />
    </ScreenSkeleton>
  );
}
