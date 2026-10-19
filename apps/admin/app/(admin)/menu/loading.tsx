// Shown instantly while this page's code loads; matches its layout.
import {
  PageSkeleton,
} from "../../../components/AdminSkeletons";

export default function Loading() {
  return (
    <PageSkeleton label="Opening Menu and prices" actions={2} columns={["media", "title", "text", "number", "badge", "badge", "action"]} rows={8} />
  );
}
