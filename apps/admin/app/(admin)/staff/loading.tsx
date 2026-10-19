// Shown instantly while this page's code loads; matches its layout.
import {
  PageSkeleton,
} from "../../../components/AdminSkeletons";

export default function Loading() {
  return (
    <PageSkeleton label="Opening Account roles" actions={0} toolbar={0} columns={["title", "text", "text", "badge", "text"]} />
  );
}
