import { CatalogValidationError } from '@cafeos/shared/inventory/orders';
import { cashierError, requireCashier } from '../../../../lib/server';

export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  try {
    const { db } = await requireCashier(req);
    const { queue = 'active', page = 0 } = await req.json();
    if (!['active', 'future', 'parked'].includes(queue) || !Number.isSafeInteger(page) || page < 0 || page > 10000) throw new CatalogValidationError('Invalid order queue', 400);
    const now = new Date().toISOString();
    let query = db.from('orders').select('*,items:order_items(*)', { count: 'exact' }).in('status', ['pending', 'confirmed', 'preparing', 'ready']);
    if (queue === 'parked') query = query.eq('is_parked', true).order('created_at', { ascending: false });
    else {
      query = query.eq('is_parked', false);
      if (queue === 'future') query = query.eq('payment_status', 'paid').in('status', ['pending', 'confirmed']).gt('preparation_due_at', now).order('preparation_due_at', { ascending: true }).order('id', { ascending: true });
      else query = query.or(`pickup_window_start.is.null,preparation_due_at.lte.${now},payment_status.neq.paid,status.in.(preparing,ready)`).order('created_at', { ascending: true }).order('id', { ascending: true });
    }
    const { data, error, count } = await query.range(page * 50, page * 50 + 49);
    if (error) throw new CatalogValidationError(error.code === '42703' ? 'Apply the customer scheduling upgrade to use order queues.' : 'Order queue could not be loaded.', 503);
    return Response.json({ orders: data, total: count ?? 0, page, server_now: now }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return cashierError(error); }
}
