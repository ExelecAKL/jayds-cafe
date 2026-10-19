// Shown instantly while this page's code loads; matches its layout.
import {
  SkeletonStatus,
  HeaderSkeleton,
  MetricsSkeleton,
  ChartSkeleton,
} from "../../../components/AdminSkeletons";

export default function Loading() {
  return (
    <SkeletonStatus label="Opening Sales reports" className="ask-page"><HeaderSkeleton actions={2} /><MetricsSkeleton label={null} count={4} /><section className="ops-panel"><ChartSkeleton label={null} bars={14} /></section></SkeletonStatus>
  );
}
