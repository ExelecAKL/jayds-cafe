// Shown instantly while this page's code loads; matches its layout.
import {
  PageSkeleton,
} from "../../../components/AdminSkeletons";

export default function Loading() {
  return (
    <PageSkeleton label="Opening Notifications" actions={2} toolbar={2} columns={["media", "title", "text"]} rows={6} />
  );
}
