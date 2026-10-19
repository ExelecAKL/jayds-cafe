// Fallback for any customer screen without its own loading shape.
import { ScreenSkeleton } from "../../components/Skeletons";

export default function Loading() {
  return <ScreenSkeleton label="One moment, getting things ready" />;
}
