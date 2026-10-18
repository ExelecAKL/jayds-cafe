// Mirrors award_points_on_completion and its paid-completion trigger.
// The final award uses the member's tier when the order completes.
export function estimateOrderPoints(
  total: number,
  tier: string | null | undefined,
  member: boolean,
) {
  if (!member || !Number.isFinite(total) || total < 0) return 0;
  const base = Math.max(1, Math.floor(Math.round(total * 100) / 1000));
  const multiplier = tier === "Gold" ? 15 : tier === "Silver" ? 12 : 10;
  return Math.floor((base * multiplier) / 10);
}
