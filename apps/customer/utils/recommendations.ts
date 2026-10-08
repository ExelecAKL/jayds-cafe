import type { MenuItem, SelectedVariant } from "@cafeos/shared/types";

export interface PurchaseSummary {
  menu_item_id: string;
  name: string;
  price: number;
  variants: SelectedVariant[];
  last_order_at: string;
  purchase_count: number;
  weight: number;
}
export interface RecommendationHistory {
  hasOrderHistory: boolean;
  products: PurchaseSummary[];
}
export interface ReorderRecommendation {
  product: MenuItem;
  previous: Pick<PurchaseSummary, "price" | "variants">;
}
export interface DiscoveryRecommendation {
  product: MenuItem;
  reason: string;
}
export interface HomeRecommendations {
  hasOrderHistory: boolean;
  orderAgain: ReorderRecommendation[];
  suggestions: DiscoveryRecommendation[];
}
export const emptyRecommendations: HomeRecommendations = {
  hasOrderHistory: false,
  orderAgain: [],
  suggestions: [],
};

function tags(item: MenuItem) {
  return new Set(
    (item.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean),
  );
}
function similarity(a: MenuItem, b: MenuItem) {
  const left = tags(a),
    right = tags(b);
  const union = new Set([...left, ...right]);
  const overlap = [...left].filter((tag) => right.has(tag)).length;
  return (
    0.7 * (union.size ? overlap / union.size : 0) +
    0.3 * (a.category_id && a.category_id === b.category_id ? 1 : 0)
  );
}
const available = (product: MenuItem) =>
  product.status === "active" &&
  product.is_available &&
  (!product.category ||
    (product.category.is_active && product.category.status === "active"));

/** Pure ranking: personal purchases only; no favorites, random picks or other customers. */
export function buildHomeRecommendations(
  history: RecommendationHistory,
  catalog: MenuItem[],
): HomeRecommendations {
  if (!history.hasOrderHistory) return { ...emptyRecommendations };
  const purchased = new Set(history.products.map((row) => row.menu_item_id));
  const products = new Map(catalog.map((product) => [product.id, product]));
  const orderAgain = [...history.products]
    .sort(
      (a, b) =>
        b.last_order_at.localeCompare(a.last_order_at) ||
        a.menu_item_id.localeCompare(b.menu_item_id),
    )
    .flatMap((row) => {
      const product = products.get(row.menu_item_id);
      return product && available(product)
        ? [
            {
              product,
              previous: {
                price: Number(row.price),
                variants: row.variants ?? [],
              },
            },
          ]
        : [];
    })
    .slice(0, 4);
  const anchors = history.products.flatMap((row) => {
    const product = products.get(row.menu_item_id),
      weight = Number(row.weight);
    return product && Number.isFinite(weight) && weight > 0
      ? [{ product, weight }]
      : [];
  });
  const totalWeight = anchors.reduce((sum, anchor) => sum + anchor.weight, 0);
  const ranked = catalog
    .filter((product) => available(product) && !purchased.has(product.id))
    .map((product) => {
      let score = 0,
        best = 0,
        source: MenuItem | null = null;
      for (const anchor of anchors) {
        const contribution =
          similarity(product, anchor.product) * anchor.weight;
        score += contribution;
        if (
          contribution > best ||
          (contribution === best && source && anchor.product.id < source.id)
        ) {
          best = contribution;
          source = anchor.product;
        }
      }
      return {
        product,
        score: totalWeight ? score / totalWeight : 0,
        reason: source ? `Similar to your ${source.name}` : "",
      };
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.product.sort_order - b.product.sort_order ||
        a.product.id.localeCompare(b.product.id),
    );
  const picked: typeof ranked = [],
    categoryCounts = new Map<string, number>();
  for (const entry of ranked) {
    const category = entry.product.category_id ?? "uncategorized";
    // Diversify close matches without replacing a substantially better match.
    if (
      (categoryCounts.get(category) ?? 0) >= 2 &&
      ranked.some(
        (other) =>
          !picked.includes(other) &&
          other.product.category_id !== entry.product.category_id &&
          other.score >= entry.score * 0.8,
      )
    )
      continue;
    picked.push(entry);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    if (picked.length === 4) break;
  }
  for (const entry of ranked) {
    if (picked.length === 4) break;
    if (!picked.includes(entry)) picked.push(entry);
  }
  return {
    hasOrderHistory: true,
    orderAgain,
    suggestions: picked.map(({ product, reason }) => ({ product, reason })),
  };
}
