// Shown instantly while this screen loads; keeps the cashier frame in place.
import { PosScreenSkeleton } from "../../../components/PosSkeletons";

export default function Loading() {
  return <PosScreenSkeleton screen="orders" title="Orders" label="Opening Orders" />;
}
