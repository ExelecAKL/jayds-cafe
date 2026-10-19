// apps/admin/components/StatusSemantics.tsx
// The owner's colour semantics in one place: red means a problem to act on
// now, amber needs a decision soon, green is done or healthy, blue is in
// progress or for information, gray is inactive. Colour always travels with
// an icon and a word, and every page can show its own key.
import { Badge, Icon, toneIcons, type IconName } from "./Operations";

export type SemanticTone = "danger" | "warning" | "success" | "info" | "neutral";

export const semantics: Record<
  SemanticTone,
  { colour: string; meaning: string; example: string }
> = {
  danger: {
    colour: "Red",
    meaning: "A problem that blocks service. Act on it now.",
    example: "Cancelled, out of stock, payment failed",
  },
  warning: {
    colour: "Amber",
    meaning: "Needs a check or decision today.",
    example: "Awaiting payment, running low, pending approval",
  },
  success: {
    colour: "Green",
    meaning: "Done, paid or healthy. Nothing to do.",
    example: "Paid, ready, published, active",
  },
  info: {
    colour: "Blue",
    meaning: "In progress or for your information.",
    example: "Confirmed, preparing, incoming delivery",
  },
  neutral: {
    colour: "Gray",
    meaning: "Inactive, closed or secondary.",
    example: "Completed, archived, paused, parked",
  },
};

const order: SemanticTone[] = ["danger", "warning", "success", "info", "neutral"];

export function orderStatusTone(status: string): SemanticTone {
  switch (status) {
    case "pending":
      return "warning";
    case "confirmed":
    case "preparing":
      return "info";
    case "ready":
      return "success";
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

export function paymentTone(status: string): SemanticTone {
  if (status === "paid") return "success";
  if (status === "failed") return "danger";
  if (status === "refunded") return "neutral";
  return "warning";
}

export function StatusPill({
  tone,
  children,
}: {
  tone: SemanticTone;
  children: React.ReactNode;
}) {
  return <Badge tone={tone}>{children}</Badge>;
}

/**
 * A compact key for one page: each entry shows the colour, its icon and what
 * it means here. "What colours mean" opens the general rule.
 */
export function ColorLegend({
  items,
  label = "Colour key",
}: {
  items: { tone: SemanticTone; label: string }[];
  label?: string;
}) {
  return (
    <div className="ops-legend" role="note" aria-label={label}>
      <span className="ops-legend-title">{label}</span>
      <ul>
        {items.map((item) => (
          <li key={item.tone + item.label}>
            <span className={`ops-legend-swatch tone-${item.tone}`} aria-hidden="true">
              <Icon name={toneIcons[item.tone] as IconName} size={12} />
            </span>
            <span>
              <span className="sr-only">{semantics[item.tone].colour}: </span>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
      <details className="ops-legend-more">
        <summary>What colours mean</summary>
        <ColorMeanings />
      </details>
    </div>
  );
}

/** The general rule, shown in legends and in every Help drawer. */
export function ColorMeanings() {
  return (
    <dl className="ops-color-meanings">
      {order.map((tone) => (
        <div key={tone}>
          <dt>
            <span className={`ops-legend-swatch tone-${tone}`} aria-hidden="true">
              <Icon name={toneIcons[tone] as IconName} size={12} />
            </span>
            {semantics[tone].colour}
          </dt>
          <dd>
            {semantics[tone].meaning}
            <small>{semantics[tone].example}</small>
          </dd>
        </div>
      ))}
    </dl>
  );
}
