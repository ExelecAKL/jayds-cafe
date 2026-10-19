// Shown instantly while this screen's code loads; matches its layout.
import {
  ScreenSkeleton,
  FormSkeleton,
} from "../../../../components/Skeletons";

export default function Loading() {
  return (
    <ScreenSkeleton back>
      <FormSkeleton columns={2} fields={4} label="Opening personal details" />
    </ScreenSkeleton>
  );
}
