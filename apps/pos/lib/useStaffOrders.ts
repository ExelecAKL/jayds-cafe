'use client';
import { createUuid } from "@cafeos/shared/utils/uuid";
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@cafeos/shared/supabase/client';
import type { Order } from '@cafeos/shared/types';
import type { ScheduledOrderFields } from '@cafeos/shared/customer/types';
import { cashierRequest } from './client';

export type StaffQueue = 'active' | 'future' | 'parked';
export type StaffOrder = Order & ScheduledOrderFields;
export function useStaffOrders(queue: StaffQueue, page: number) {
  const [orders, setOrders] = useState<StaffOrder[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null), [total, setTotal] = useState(0);
  const revision = useRef(0);
  const refetch = useCallback(async () => {
    const current = ++revision.current;
    try {
      const result = await cashierRequest<{ orders: StaffOrder[]; total: number }>('/api/orders/queue', { queue, page });
      if (current !== revision.current) return;
      setOrders(result.orders); setTotal(result.total); setError(null);
    } catch (failure) { if (current === revision.current) setError(failure instanceof Error ? failure.message : 'Order queue could not be loaded.'); }
    finally { if (current === revision.current) setLoading(false); }
  }, [queue, page]);
  useEffect(() => {
    let active = true;
    const refresh = () => { if (active && navigator.onLine) void refetch(); };
    void Promise.resolve().then(refresh);
    const channel = supabase.channel('staff-queue-' + createUuid()).on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refresh).subscribe();
    const timer = setInterval(refresh, 15_000);
    window.addEventListener('online', refresh); window.addEventListener('focus', refresh);
    return () => { active = false; revision.current++; clearInterval(timer); window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh); void supabase.removeChannel(channel); };
  }, [refetch]);
  return { orders, loading, error, total, refetch };
}
