import Icon from "./Icon";
import { estimateOrderPoints } from "../utils/orderPoints";

export default function OrderPoints({
  total,
  member,
  tier,
}: {
  total: number;
  member: boolean;
  tier?: string | null;
}) {
  const points = estimateOrderPoints(total, tier, member);
  return (
    <div className="order-points-preview">
      <Icon name="star" size={20} />
      <div>
        <strong>Points to earn</strong>
        <small>
          {member
            ? "Estimated · after paid completion"
            : "Sign in before ordering to earn points"}
        </small>
      </div>
      {member && <span>+{points.toLocaleString()} pts</span>}
    </div>
  );
}
