-- PART 14: Ready pickup notifications
-- Creates customer notification records when pickup-style orders become ready.

CREATE OR REPLACE FUNCTION public.notify_pickup_order_ready()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'ready'
    AND OLD.status IS DISTINCT FROM NEW.status
    AND NEW.customer_id IS NOT NULL
    AND NEW.order_type IN ('pickup', 'takeout', 'dine_in')
    AND NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = NEW.customer_id
        AND n.data->>'event' = 'pickup_ready'
        AND n.data->>'order_id' = NEW.id::text
    )
  THEN
    INSERT INTO public.notifications (user_id, title, body, type, data)
    VALUES (
      NEW.customer_id,
      NEW.order_number || ' is ready for pickup',
      'Please proceed to the counter and show your pickup QR.',
      'order_update',
      jsonb_build_object(
        'event', 'pickup_ready',
        'order_id', NEW.id,
        'order_number', NEW.order_number,
        'order_status', NEW.status,
        'order_type', NEW.order_type
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_pickup_order_ready ON public.orders;
CREATE TRIGGER trg_notify_pickup_order_ready
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_pickup_order_ready();

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

SELECT 'PART 14 COMPLETE: ready pickup notifications enabled' AS status;
