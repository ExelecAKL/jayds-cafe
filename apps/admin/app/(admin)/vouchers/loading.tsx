// Shown instantly while this page's code loads; matches its layout.
import {
  SkeletonStatus,
  HeaderSkeleton,
  CardGridSkeleton,
} from "../../../components/AdminSkeletons";

export default function Loading() {
  return (
    <SkeletonStatus label="Opening Vouchers" className="ask-page"><HeaderSkeleton actions={1} /><CardGridSkeleton label={null} count={6} /></SkeletonStatus>
  );
}
