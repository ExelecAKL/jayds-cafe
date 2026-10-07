'use client';

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@cafeos/shared/supabase/client';
import { Pagination } from '../../../components/Pagination';

interface VoidLog {
  id: string;
  order_id: string;
  staff_id: string;
  created_at: string;
  staff: { full_name: string; email: string } | null;
  order: { order_number: string } | null;
}

export default function VoidSecurityPage() {
  const [logs, setLogs] = useState<VoidLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  
  // PIN Management
  const [currentPin, setCurrentPin] = useState<string>('******');
  const [newPin, setNewPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [pinMessage, setPinMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const pageSize = 15;
  const totalPages = Math.ceil(totalItems / pageSize);

  useEffect(() => {
    fetchGlobalPin();
  }, []);

  const fetchGlobalPin = async () => {
    const { data, error } = await supabase.from('store_settings').select('void_pin').eq('id', 'global').single();
    if (!error && data) {
      setCurrentPin(data.void_pin);
    }
  };

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinMessage(null);
    if (!newPin || newPin.length !== 6 || !/^\d+$/.test(newPin)) {
      setPinMessage({ type: 'error', text: 'PIN must be exactly 6 digits.' });
      return;
    }

    setSavingPin(true);
    const { error } = await supabase
      .from('store_settings')
      .upsert({ id: 'global', void_pin: newPin, updated_at: new Date().toISOString() });
    
    if (error) {
      setPinMessage({ type: 'error', text: 'Failed to update PIN.' });
    } else {
      setPinMessage({ type: 'success', text: 'Void PIN updated successfully!' });
      setCurrentPin(newPin);
      setNewPin('');
    }
    setSavingPin(false);
  };

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    let query = supabase
      .from('void_logs')
      .select('id, created_at, order_id, staff_id, staff:profiles!void_logs_staff_id_fkey(full_name, email), order:orders!void_logs_order_id_fkey(order_number)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

    const { data, count, error } = await query;
    if (!error && data) {
      setLogs(data as unknown as VoidLog[]);
    }
    if (count !== null) setTotalItems(count);
    setLoadingLogs(false);
  }, [currentPage]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Void Security</h1>
        <p className="text-gray-500 text-sm mt-1">Manage Manager Override PIN and review the void audit log.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* PIN Management Card */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sticky top-8">
            <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-xl">🔒</span> Manager PIN
            </h2>
            
            <div className="bg-gray-50 rounded-xl p-4 mb-6 text-center border border-gray-100">
              <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">Current PIN</p>
              <p className="text-3xl font-mono font-black tracking-[0.25em] text-gray-900">{currentPin}</p>
            </div>

            <form onSubmit={handleUpdatePin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Update PIN</label>
                <input
                  type="password"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6-digit PIN"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all text-center font-mono text-xl tracking-widest"
                />
              </div>

              {pinMessage && (
                <div className={`p-3 rounded-xl text-sm ${pinMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {pinMessage.text}
                </div>
              )}

              <button
                type="submit"
                disabled={savingPin || newPin.length !== 6}
                className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black disabled:opacity-50 transition-colors"
              >
                {savingPin ? 'Saving...' : 'Set New PIN'}
              </button>
            </form>
          </div>
        </div>

        {/* Audit Logs */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <h2 className="font-bold text-gray-900">Void Audit Log</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-white text-gray-500 text-xs uppercase tracking-wider">
                    <th className="px-6 py-3 text-left font-medium">Date & Time</th>
                    <th className="px-6 py-3 text-left font-medium">Order #</th>
                    <th className="px-6 py-3 text-left font-medium">Voided By (Staff)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loadingLogs ? (
                    <tr><td colSpan={3} className="px-6 py-12 text-center"><div className="w-8 h-8 mx-auto border-4 border-red-200 border-t-red-500 rounded-full animate-spin" /></td></tr>
                  ) : logs.length === 0 ? (
                    <tr><td colSpan={3} className="px-6 py-12 text-center text-gray-400">No void logs found.</td></tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-gray-600">
                          {new Date(log.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4 font-mono font-medium text-gray-900">
                          {log.order?.order_number || 'Unknown'}
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-900">{log.staff?.full_name || 'Unknown Staff'}</p>
                          <p className="text-xs text-gray-500">{log.staff?.email || ''}</p>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {!loadingLogs && logs.length > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
