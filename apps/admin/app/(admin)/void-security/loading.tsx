// Shown instantly while this page's code loads; matches its layout.
import {
  SkeletonStatus,
  HeaderSkeleton,
  FormSkeleton,
  TableSkeleton,
} from "../../../components/AdminSkeletons";

export default function Loading() {
  return (
    <SkeletonStatus label="Opening Cancellation PIN" className="ask-page"><HeaderSkeleton actions={0} /><FormSkeleton label={null} sections={1} fields={2} /><TableSkeleton label={null} rows={5} columns={["text", "title", "text"]} /></SkeletonStatus>
  );
}
