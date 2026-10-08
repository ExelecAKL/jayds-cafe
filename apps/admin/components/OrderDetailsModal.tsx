import { useState, useEffect } from 'react';
import { supabase } from '@cafeos/shared/supabase/client';
import type { Order, OrderItem, OrderStatus, Profile } from '@cafeos/shared/types';
import { menuProductImageUrl } from '@cafeos/shared/utils/product-images';

interface OrderDetailsModalProps {
  orderId: string;
  onClose: () => void;
}

type DetailedOrder = Omit<Order, 'items' | 'customer'> & {
  customer?: Pick<Profile, 'full_name' | 'phone' | 'email'> | null;
  items?: (OrderItem & { menu_item?: { image_url: string | null } | null })[];
};

const statusColors: Record<OrderStatus, string> = {
  pending: 'bg-yellow-50 text-yellow-700',
  confirmed: 'bg-blue-50 text-blue-700',
  preparing: 'bg-purple-50 text-purple-700',
  ready: 'bg-green-50 text-green-700',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-50 text-red-700',
};

export function OrderDetailsModal({ orderId, onClose }: OrderDetailsModalProps) {
  const [order, setOrder] = useState<DetailedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);

  const maskString = (str: string | null | undefined, isEmail = false) => {
    if (!str) return '—';
    if (isEmail) {
      const [local, domain] = str.split('@');
      if (!domain) return str;
      return `${local.substring(0, 2)}***@${domain}`;
    }
    // Mask phone e.g. +63 912 345 6789 -> +63 912 *** ****
    if (str.length > 6) return str.substring(0, str.length - 6) + '*** ****';
    return '***';
  };

  useEffect(() => {
    async function fetchDetails() {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:profiles!orders_customer_id_fkey(full_name, phone, email),
          items:order_items(
            id, menu_item_id, name, price, quantity, variants, subtotal, notes,
            menu_item:menu_items(image_url)
          )
        `)
        .eq('id', orderId)
        .single();
      
      if (!error && data) {
        setOrder(data as DetailedOrder);
      }
      setLoading(false);
    }
    void fetchDetails();
  }, [orderId]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <h3 className="font-bold text-gray-900">Order Details</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold p-2">✕</button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
             <div className="py-20 flex justify-center">
               <div className="w-8 h-8 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
             </div>
          ) : !order ? (
             <div className="text-center py-10 text-gray-400">Order could not be loaded.</div>
          ) : (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-4">
                <div>
                  <h1 className="text-3xl font-black text-gray-900 mb-1">{order.order_number}</h1>
                  <p className="text-sm text-gray-500">
                    {new Date(order.created_at).toLocaleString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2 ${statusColors[order.status as OrderStatus]}`}>
                    {order.status}
                  </span>
                  <p className="text-sm font-medium text-gray-900 uppercase">
                    {order.order_source === 'pos' ? 'POS' : 'App'} · {order.order_type.replace('_', ' ')}
                  </p>
                  <p className={`text-xs font-bold uppercase mt-1 ${order.payment_status === 'paid' ? 'text-green-600' : 'text-amber-600'}`}>
                    {order.payment_method === 'maya' ? '💳 MAYA ' : '💵 CASH '} · {order.payment_status}
                  </p>
                </div>
              </div>

              {/* Customer Info */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <h4 className="text-xs font-bold text-gray-500 tracking-wider uppercase mb-3 flex items-center justify-between">
                  Customer Information
                  <button onClick={() => setRevealed(!revealed)} className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full hover:bg-gray-300 transition-colors">
                    {revealed ? 'Hide Data' : 'Reveal Data'}
                  </button>
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Name</label>
                    <p className="font-medium text-gray-900">{order.customer?.full_name || 'Walk-in Customer'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Contact</label>
                    <p className="font-medium text-gray-900 font-mono text-sm">
                      {revealed ? (order.customer?.phone || order.customer?.email || '—') : maskString(order.customer?.phone || order.customer?.email, !order.customer?.phone)}
                    </p>
                  </div>
                </div>
                {order.notes && (
                  <div className="mt-4 pt-4 border-t border-gray-200/60">
                    <label className="text-xs text-gray-500 block mb-1">Order Notes</label>
                    <p className="text-sm text-gray-700 italic bg-amber-50/50 p-3 rounded-lg border border-amber-100/50">{order.notes}</p>
                  </div>
                )}
              </div>

              {/* Order Items */}
              <div>
                <h4 className="text-xs font-bold text-gray-500 tracking-wider uppercase mb-3">Receipt Breakdown</h4>
                <div className="space-y-3">
                  {order.items?.map((item) => (
                    <div key={item.id} className="flex gap-4 p-4 rounded-xl border border-gray-100 bg-white shadow-sm">
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                        {menuProductImageUrl(item.menu_item_id, item.menu_item?.image_url) ? (
                          <img src={menuProductImageUrl(item.menu_item_id, item.menu_item?.image_url)!} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-lg">☕</div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-1">
                          <p className="font-bold text-gray-900">{item.name} <span className="text-gray-400 font-normal">x{item.quantity}</span></p>
                          <p className="font-bold text-gray-900">₱{item.subtotal.toFixed(2)}</p>
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-2 mb-2">
                          <span>Base: ₱{item.price.toFixed(2)} ea</span>
                        </div>
                        
                        {/* Variants List */}
                        {item.variants && item.variants.length > 0 && (
                          <div className="mt-2 space-y-1 pl-2 border-l-2 border-amber-200">
                            {item.variants.map((v, idx) => (
                              <div key={idx} className="flex justify-between text-xs text-gray-600">
                                <span>+ {v.variant_group}: {v.label}</span>
                                <span>₱{v.price_modifier > 0 ? v.price_modifier.toFixed(2) : '0.00'}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {item.notes && (
                          <p className="text-xs mt-2 text-red-600 italic">&ldquo;{item.notes}&rdquo;</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Summary */}
              <div className="border-t border-gray-100 pt-4 flex flex-col items-end text-sm space-y-2">
                <div className="flex justify-between w-48 text-gray-500">
                  <span>Subtotal</span>
                  <span>₱{order.subtotal?.toFixed(2) || '0.00'}</span>
                </div>
                {order.points_earned > 0 && (
                  <div className="flex justify-between w-48 text-amber-600">
                    <span>Points Earned</span>
                    <span>+{order.points_earned}⭐</span>
                  </div>
                )}
                {order.points_redeemed > 0 && (
                  <div className="flex justify-between w-48 text-green-600">
                    <span>Points Redeemed</span>
                    <span>-{order.points_redeemed} pts</span>
                  </div>
                )}
                <div className="flex justify-between w-48 text-lg font-black text-gray-900 pt-2 border-t border-gray-100">
                  <span>Total</span>
                  <span>₱{order.total?.toFixed(2) || '0.00'}</span>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
