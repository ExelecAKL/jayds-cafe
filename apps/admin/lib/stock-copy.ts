// Friendly labels for known legacy setup records. The original immutable
// ledger values remain available in exports and recorded-change snapshots.
export function stockReason(reason: string | null | undefined) {
  if (reason === "Thesis demo opening stock: existing database quantity, authorized by owner; not a physical shelf count.")
    return "Opening balance from recorded stock; physical count pending.";
  if (reason === "Sample recipe for thesis demonstration; validate actual portions before café production. Packaging uses existing size-option requirements.")
    return "Initial recipe quantities; serving portions need review.";
  if (reason === "Owner authorized existing quantities as thesis/demo opening stock. Actual physical quantities and sample recipes require verification before café production.")
    return "Opening balance from recorded stock; physical counts and serving portions need review.";
  return reason;
}

export function stockAction(action: string) {
  return action === "thesis_demo_recipe" ? "Recipe setup" : action;
}
