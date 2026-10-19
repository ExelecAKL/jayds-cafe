// Shown instantly while this page's code loads; matches its layout.
import {
  PageSkeleton,
} from "../../../components/AdminSkeletons";

export default function Loading() {
  return (
    <PageSkeleton label="Opening Overview" metrics={4} actions={1} columns={["title", "badge", "number"]} rows={6} />
  );
}
