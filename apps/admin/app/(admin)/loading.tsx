// Fallback for any Admin page without its own loading shape.
import { PageSkeleton } from "../../components/AdminSkeletons";

export default function Loading() {
  return <PageSkeleton label="Opening this page" />;
}
