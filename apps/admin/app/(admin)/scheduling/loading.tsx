// Shown instantly while this page's code loads; matches its layout.
import {
  SkeletonStatus,
  HeaderSkeleton,
  FormSkeleton,
} from "../../../components/AdminSkeletons";

export default function Loading() {
  return (
    <SkeletonStatus label="Opening Hours and pickup" className="ask-page"><HeaderSkeleton actions={0} /><FormSkeleton label={null} sections={2} fields={6} /></SkeletonStatus>
  );
}
