-- Legacy setup installed two triggers calling the same award function.
-- Keep one paid-completion trigger. Historical balances and orders are untouched.
DROP TRIGGER IF EXISTS on_order_completed ON public.orders;
DROP TRIGGER IF EXISTS trg_award_points ON public.orders;
CREATE TRIGGER trg_award_points
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
        AND NEW.payment_status = 'paid' AND NEW.customer_id IS NOT NULL)
  EXECUTE FUNCTION public.award_points_on_completion();
