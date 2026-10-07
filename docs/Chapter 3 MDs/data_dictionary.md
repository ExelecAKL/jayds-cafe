# CafeOS Data Dictionary

This document outlines the database schema for the CafeOS monorepo. Since the Customer, POS, and Admin applications all operate on a unified Supabase backend, they share these tables.

## 👥 Users & Profiles

### Profiles Table
Stores extended user information for both customers and staff. Tied to Supabase Auth (`auth.users`).
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PRIMARY KEY | Unique UUID for the user profile. |
| `full_name` | text | NULLABLE | The user's full display name. |
| `role` | text | NOT NULL, DEFAULT 'customer' | The system role of the user (e.g., 'customer', 'staff', 'admin'). |
| `avatar_url` | text | NULLABLE | URL to the user's profile picture or avatar. |
| `phone` | text | NULLABLE | The user's contact phone number. |
| `created_at` | timestamp | NOT NULL, DEFAULT now() | Profile creation timestamp. |
| `updated_at` | timestamp | NOT NULL, DEFAULT now() | Last update timestamp. |
| `points` | integer | NOT NULL, DEFAULT 0 | Current loyalty points balance for the user. |
| `total_orders` | integer | NOT NULL, DEFAULT 0 | Total number of successful orders placed by the user. |
| `last_check_in` | date | NULLABLE | Date of the user's last login or activity. |
| `loyalty_tier` | text | NOT NULL, DEFAULT 'Bronze' | The user's current loyalty tier classification. |
| `total_spent` | numeric | NOT NULL, DEFAULT 0 | Cumulative amount spent by the user across all orders. |
| `favorite_items` | uuid[] | DEFAULT '{}' | Array of menu item UUIDs marked as favorites. |
| `last_order_at` | timestamp | NULLABLE | Timestamp of the user's most recent order. |

### Saved Addresses Table
Stores delivery addresses saved by customers.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique UUID for the saved address. |
| `user_id` | uuid | NOT NULL | Foreign key linking to the Profiles table. |
| `label` | text | NOT NULL, DEFAULT 'Home' | User-defined label for the address (e.g., 'Home', 'Work'). |
| `address` | text | NOT NULL | The full string of the delivery address. |
| `lat` | numeric(10,7) | NOT NULL | Latitude coordinate of the address. |
| `lng` | numeric(10,7) | NOT NULL | Longitude coordinate of the address. |
| `created_at` | timestamp | DEFAULT now() | Creation timestamp. |

---

## ☕ Menu & Inventory

### Categories Table
Product categories for the menu (e.g., Coffee, Pastries).
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique UUID for the category. |
| `name` | text | NOT NULL | Display name of the category. |
| `description` | text | NULLABLE | Optional explanation of the category contents. |
| `image_url` | text | NULLABLE | URL to an image representing the category. |
| `created_at` | timestamp | NOT NULL, DEFAULT now() | Creation timestamp. |

### Menu Items Table
The core products available for sale.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique UUID for the menu item. |
| `category_id` | uuid | NULLABLE | Foreign key linking to the Categories table. |
| `name` | text | NOT NULL | Display name of the menu item. |
| `description` | text | NULLABLE | Details or ingredients listed for the menu item. |
| `price` | numeric(10,2) | NOT NULL | Base price of the menu item. |
| `image_url` | text | NULLABLE | URL to the product image. |
| `is_available` | boolean | NOT NULL, DEFAULT true | Toggle indicating if the item is available for order. |
| `created_at` | timestamp | NOT NULL, DEFAULT now() | Creation timestamp. |
| `updated_at` | timestamp | NOT NULL, DEFAULT now() | Last update timestamp. |
| `sort_order` | integer | DEFAULT 0 | Determines display ordering within the category. |
| `status` | text | DEFAULT 'active' | Operational status of the item (e.g., 'active', 'archived'). |

### Customizations Table
Base customizations (e.g., "Size", "Sugar Level") linked to menu items.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique UUID for the customization group. |
| `menu_item_id` | uuid | NOT NULL | Foreign key linking to the Menu Items table. |
| `name` | text | NOT NULL | Display name of the customization group (e.g., 'Select Size'). |
| `is_required` | boolean | NOT NULL, DEFAULT false | Flag to enforce selection before checkout. |
| `max_selections` | integer | NOT NULL, DEFAULT 1 | Maximum number of options a customer can pick. |

### Customization Options Table
The specific choices for a customization (e.g., "Large", "50%").
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique UUID for the specific option. |
| `customization_id` | uuid | NOT NULL | Foreign key linking to the Customizations table. |
| `name` | text | NOT NULL | Display name of the option (e.g., 'Large', 'Extra Shot'). |
| `price_adjustment` | numeric(10,2) | NOT NULL, DEFAULT 0 | Additional cost added to the base price if selected. |

### Menu Ingredients Table
Raw materials and inventory stock.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique UUID for the inventory ingredient. |
| `name` | text | NOT NULL | Name of the raw material (e.g., 'Coffee Beans'). |
| `unit` | text | NOT NULL | Measurement unit used (e.g., 'g', 'ml', 'pcs'). |
| `stock_level` | numeric | NOT NULL, DEFAULT 0 | Current quantity available in stock. |
| `low_stock_threshold` | numeric | NOT NULL, DEFAULT 10 | Threshold at which low-stock alerts are triggered. |
| `cost_per_unit` | numeric | NOT NULL, DEFAULT 0 | Estimated cost per unit for profitability tracking. |
| `created_at` | timestamp | DEFAULT now() | Creation timestamp. |
| `updated_at` | timestamp | DEFAULT now() | Last update timestamp. |

### Variant Ingredients Table
Maps customization options to the specific ingredients they consume.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique UUID for the mapping record. |
| `variant_label` | text | NOT NULL | The label of the variant triggering consumption. |
| `variant_group` | text | NOT NULL | The customization group the variant belongs to. |
| `ingredient_id` | uuid | NOT NULL | Foreign key linking to the Menu Ingredients table. |
| `quantity_used` | numeric | NOT NULL, DEFAULT 1 | Amount of the ingredient's unit consumed. |
| `replaces_ingredient_id` | uuid | NULLABLE | Optional ID of an ingredient this variant replaces. |

### Inventory Logs Table
Audit trail of inventory adjustments (restocks, consumption, spoilage).
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique UUID for the log entry. |
| `ingredient_id` | uuid | NULLABLE | Foreign key linking to the affected Menu Ingredients. |
| `change_amount` | numeric | NOT NULL | Amount added (positive) or deducted (negative). |
| `reason` | text | NOT NULL | Categorical reason for adjustment (e.g., 'restock', 'sale'). |
| `created_by` | uuid | NULLABLE | Profile UUID of the staff member who made the adjustment. |
| `created_at` | timestamp | DEFAULT now() | Timestamp of the inventory change. |

### Inventory Supplier Table
Supplier information for inventory items.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique UUID for the supplier record. |
| `ingredient_id` | uuid | NULLABLE | Foreign key linking to the supplied Menu Ingredients. |
| `supplier_name` | text | NOT NULL | Name of the supply company or vendor. |
| `contact_info` | text | NULLABLE | Contact details (phone/email) for the supplier. |
| `lead_time_days` | integer | DEFAULT 1 | Expected days for delivery after placing an order. |
| `last_order_date` | timestamp | NULLABLE | Timestamp of the last resupply order. |

---

## 🛒 Orders & Transactions

### Orders Table
The main transaction record.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique UUID for the overall order. |
| `user_id` | uuid | NULLABLE | Profile UUID of the customer (null for guests). |
| `status` | text | NOT NULL, DEFAULT 'pending' | Fulfillment state (e.g., 'pending', 'preparing', 'completed'). |
| `total` | numeric(10,2) | NOT NULL | Final total price charged for the order. |
| `created_at` | timestamp | NOT NULL, DEFAULT now() | Creation timestamp. |
| `updated_at` | timestamp | NOT NULL, DEFAULT now() | Last update timestamp. |
| `order_number` | text | NULLABLE | Human-readable tracking number (e.g., 'ORD-0001'). |
| `payment_status` | text | DEFAULT 'pending' | Status of payment (e.g., 'pending', 'paid', 'failed'). |
| `payment_method` | text | NULLABLE | Payment method used (e.g., 'maya', 'cash'). |
| `maya_checkout_id` | text | NULLABLE | Transaction reference ID from Maya API. |
| `order_type` | text | DEFAULT 'dine-in' | Method of fulfillment ('dine-in', 'takeout', 'delivery'). |
| `table_number` | text | NULLABLE | Table number if dine-in order. |
| `notes` | text | NULLABLE | Special instructions provided by the customer. |
| `staff_id` | uuid | NULLABLE | Profile UUID of the staff member who processed the order. |
| `delivery_address` | jsonb | NULLABLE | Snapshot of the delivery address used. |
| `lalamove_quotation_id` | text | NULLABLE | Delivery quote reference from Lalamove API. |
| `lalamove_order_id` | text | NULLABLE | Tracking reference ID for the Lalamove dispatch. |
| `points_earned` | integer | DEFAULT 0 | Number of loyalty points granted for this order. |
| `points_redeemed` | integer | DEFAULT 0 | Discount value applied from redeemed loyalty points. |

### Order Items Table
Individual items within an order.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique UUID for the line item. |
| `order_id` | uuid | NOT NULL | Foreign key linking to the parent Orders table. |
| `menu_item_id` | uuid | NOT NULL | Foreign key linking to the ordered Menu Items. |
| `quantity` | integer | NOT NULL | Number of this specific item ordered. |
| `unit_price` | numeric(10,2) | NOT NULL | Price of the item at the time of purchase. |
| `customizations` | jsonb | NULLABLE | Snapshot of selected customizations/variants. |
| `created_at` | timestamp | NOT NULL, DEFAULT now() | Timestamp when the item was added to the order. |

---

## 🎁 Vouchers & Loyalty

### Vouchers Table
Discount codes and promotional rules.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique UUID for the voucher. |
| `code` | text | NOT NULL | The string code input by customers (e.g., 'SUMMER10'). |
| `description` | text | NULLABLE | Internal description or explanation of the promotion. |
| `discount_type` | text | NOT NULL | Mechanism of discount ('percentage' or 'fixed'). |
| `discount_value` | numeric(10,2) | NOT NULL | Value of the discount based on the type. |
| `min_order_amount` | numeric(10,2) | DEFAULT 0 | Minimum cart subtotal required to apply. |
| `max_uses` | integer | NULLABLE | Total global limit on how many times it can be claimed. |
| `uses_count` | integer | DEFAULT 0 | Running tally of successful claims. |
| `valid_from` | timestamp | DEFAULT now() | Start timestamp for voucher validity. |
| `valid_until` | timestamp | NULLABLE | End timestamp for voucher validity. |
| `is_active` | boolean | DEFAULT true | Toggle to enable/disable the voucher manually. |
| `created_at` | timestamp | DEFAULT now() | Creation timestamp. |
| `target_tier` | text | NULLABLE | Limits usage to specific loyalty tiers (e.g., 'Gold'). |
| `target_users` | jsonb | NULLABLE | Array of user UUIDs explicitly eligible for the voucher. |
| `frequency_limit` | integer | NULLABLE | Limits how many times a single user can claim it. |
| `deployed_at` | timestamp | NULLABLE | Timestamp when the voucher went live. |
| `applicable_item_ids` | jsonb | DEFAULT '[]' | Restricts discount to specific menu item UUIDs. |
| `application_mode` | text | DEFAULT 'whole_order' | Dictates if it applies to the full cart or specific items. |
| `max_discount_amount` | numeric | NULLABLE | Absolute maximum cap on percentage-based discounts. |

### Voucher Claims Table
Records of customers saving/claiming vouchers.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique UUID for the claim record. |
| `voucher_id` | uuid | NOT NULL | Foreign key linking to the Vouchers table. |
| `user_id` | uuid | NOT NULL | Profile UUID of the claiming customer. |
| `claimed_at` | timestamp | NOT NULL, DEFAULT now() | Timestamp when the voucher was saved to the account. |
| `expires_at` | timestamp | NULLABLE | Individual expiration date for this specific claim. |
| `used_at` | timestamp | NULLABLE | Timestamp when the customer successfully spent the voucher. |
| `order_id` | uuid | NULLABLE | Foreign key linking to the Order where the voucher was used. |

---

## 💼 Staff & Operations

### Void Tokens Table
Tokens generated by admins to authorize voiding transactions.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique UUID for the token. |
| `token_hash` | text | NOT NULL | Encrypted string value of the one-time PIN. |
| `created_by` | uuid | NULLABLE | Profile UUID of the admin who generated the token. |
| `used_by` | uuid | NULLABLE | Profile UUID of the staff member who consumed the token. |
| `used_at` | timestamp | NULLABLE | Timestamp when the token was successfully verified. |
| `order_id` | uuid | NULLABLE | Order UUID that was voided using this token. |
| `expires_at` | timestamp | NOT NULL | Timestamp when the generated token expires. |
| `is_used` | boolean | NOT NULL, DEFAULT false | Flag marking if the token is already consumed. |
| `created_at` | timestamp | DEFAULT now() | Creation timestamp. |

### Void Logs Table
Audit trail of voided transactions.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique UUID for the audit log entry. |
| `order_id` | uuid | NULLABLE | Order UUID that was successfully cancelled/voided. |
| `staff_id` | uuid | NULLABLE | Profile UUID of the staff member who performed the void. |
| `created_at` | timestamp | DEFAULT now() | Timestamp when the void was executed. |

---

## ⚙️ Configuration

### Store Settings Table
Global store configuration, like the void PIN.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | text | PRIMARY KEY, DEFAULT 'global' | Unique string key representing the setting group. |
| `void_pin` | text | NOT NULL, DEFAULT '123456' | The global master PIN for authorizing high-level voids. |
| `updated_at` | timestamp | DEFAULT now() | Timestamp of the last configuration change. |

### Delivery Settings Table
Settings specific to local delivery APIs like Lalamove.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | text | PRIMARY KEY, DEFAULT 'global' | Unique string key representing the setting group. |
| `base_fee` | numeric | NOT NULL, DEFAULT 50 | Starting flat fee for all delivery dispatches. |
| `fee_per_km` | numeric | NOT NULL, DEFAULT 10 | Additional charge per kilometer of delivery distance. |
| `max_distance_km` | numeric | NOT NULL, DEFAULT 15 | Maximum permitted radius for delivery orders. |
| `is_active` | boolean | NOT NULL, DEFAULT true | Global toggle to enable/disable delivery routing. |
| `updated_at` | timestamp | DEFAULT now() | Timestamp of the last delivery setting change. |
