// Shown instantly while this page's code loads; matches its layout.
import {
  PageSkeleton,
} from "../../../components/AdminSkeletons";

export default function Loading() {
  return (
    <PageSkeleton label="Opening Customer help" tabs={3} actions={1} columns={["title", "badge", "text", "action"]} />
  );
}
