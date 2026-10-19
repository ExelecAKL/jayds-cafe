// Shown instantly while this page's code loads; matches its layout.
import {
  PageSkeleton,
} from "../../../components/AdminSkeletons";

export default function Loading() {
  return (
    <PageSkeleton label="Opening Change history" actions={1} toolbar={2} columns={["text", "title", "text", "badge"]} rows={8} />
  );
}
