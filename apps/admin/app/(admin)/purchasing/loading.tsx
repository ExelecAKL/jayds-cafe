// Shown instantly while this page's code loads; matches its layout.
import {
  PageSkeleton,
} from "../../../components/AdminSkeletons";

export default function Loading() {
  return (
    <PageSkeleton label="Opening Buy and receive stock" tabs={3} actions={2} columns={["title", "text", "badge", "number", "action"]} />
  );
}
