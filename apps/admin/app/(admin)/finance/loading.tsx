// Shown instantly while this page's code loads; matches its layout.
import {
  PageSkeleton,
} from "../../../components/AdminSkeletons";

export default function Loading() {
  return (
    <PageSkeleton label="Opening Finance and invoices" metrics={4} tabs={4} actions={2} columns={["title", "text", "badge", "number"]} />
  );
}
