// Shown instantly while this page's code loads; matches its layout.
import {
  PageSkeleton,
} from "../../../components/AdminSkeletons";

export default function Loading() {
  return (
    <PageSkeleton label="Opening Customer points" metrics={3} actions={1} columns={["title", "badge", "number", "action"]} />
  );
}
