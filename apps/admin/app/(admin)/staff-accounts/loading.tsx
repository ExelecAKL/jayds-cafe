// Shown instantly while this page's code loads; matches its layout.
import {
  PageSkeleton,
} from "../../../components/AdminSkeletons";

export default function Loading() {
  return (
    <PageSkeleton label="Opening Staff access" actions={0} toolbar={0} columns={["title", "badge", "text", "action"]} rows={6} />
  );
}
