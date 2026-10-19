// Shown instantly while this page's code loads; matches its layout.
import {
  PageSkeleton,
} from "../../../components/AdminSkeletons";

export default function Loading() {
  return (
    <PageSkeleton label="Opening Stock and recipes" metrics={4} tabs={5} actions={2} columns={["title", "number", "number", "badge", "action"]} />
  );
}
