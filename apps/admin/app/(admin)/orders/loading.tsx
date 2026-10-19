// Shown instantly while this page's code loads; matches its layout.
import {
  PageSkeleton,
} from "../../../components/AdminSkeletons";

export default function Loading() {
  return (
    <PageSkeleton label="Opening Orders" toolbar={5} actions={0} columns={["title", "text", "text", "badge", "badge", "badge", "number", "text"]} rows={8} />
  );
}
