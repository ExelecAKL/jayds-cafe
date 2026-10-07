-- Add the delivery order type used by the customer checkout flow.
-- Keep this in its own migration because PostgreSQL enum values should not be
-- used by later statements until the ALTER TYPE transaction has committed.

ALTER TYPE order_type ADD VALUE IF NOT EXISTS 'delivery';
