// Shown instantly while this page's code loads; matches its layout.
import {
  PageSkeleton,
} from "../../../components/AdminSkeletons";

export default function Loading() {
  return (
    <PageSkeleton label="Opening Menu categories" actions={1} toolbar={1} columns={["title", "number", "badge", "action"]} />
  );
}
