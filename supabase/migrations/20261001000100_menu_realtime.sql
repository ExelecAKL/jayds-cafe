-- Publish admin catalog changes to customer and POS menu subscriptions.
DO $$
DECLARE
  catalog_table text;
BEGIN
  FOREACH catalog_table IN ARRAY ARRAY['menu_items', 'categories', 'item_variants'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = catalog_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', catalog_table);
    END IF;
  END LOOP;
END $$;
