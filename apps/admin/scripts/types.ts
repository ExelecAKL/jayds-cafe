export interface VariantInsert {
  menu_item_id: string;
  variant_group: string;
  label: string;
  price_modifier: number;
  is_default: boolean;
  sort_order: number;
}

export interface MenuWithCategory {
  id: string;
  name: string;
  category_id?: string | null;
  category: { name: string } | null;
}
