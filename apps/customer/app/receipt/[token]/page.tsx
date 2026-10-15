// apps/customer/app/receipt/[token]/page.tsx
// Public guest receipt page — no auth required, auto-expires after 30 days

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@cafeos/shared/supabase/client";
import {InvoiceDocument,type InvoiceRecord} from "@cafeos/shared/finance/invoice";

interface ReceiptData {
  invoice?: InvoiceRecord | null;
  order_number?: string;
  items?: {
    name: string;
    qty: number;
    price: number;
    variants?: { label: string }[];
    notes?: string | null;
  }[];
  subtotal?: number;
  discount?: number;
  cash_received?: number | null;
  change_due?: number | null;
  total?: number;
  payment_method?: string;
  date?: string;
}

interface GuestReceipt {
  id: string;
  receipt_token: string;
  receipt_data: ReceiptData;
  created_at: string;
  expires_at: string;
}

export default function GuestReceiptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const [receipt, setReceipt] = useState<GuestReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const fetchReceipt = async () => {
      const { data, error } = await supabase.rpc("get_guest_receipt", {
        p_token: token,
      });

      if (error || !data) {
        setExpired(true);
      } else if (new Date(data.expires_at) < new Date()) {
        setExpired(true);
      } else {
        setReceipt(data as GuestReceipt);
      }
      setLoading(false);
    };

    void fetchReceipt();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (expired || !receipt) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <span className="text-5xl mb-4 block">🧾</span>
          <h1 className="text-xl font-bold text-gray-800">Receipt Not Found</h1>
          <p className="text-sm text-gray-500 mt-2">
            This receipt has expired or does not exist. Receipts are valid for
            30 days.
          </p>
          <button
            onClick={() => router.push("/menu")}
            className="mt-6 w-full py-3 bg-amber-500 text-white font-bold rounded-xl shadow hover:bg-amber-600 transition-colors"
          >
            Go to Menu
          </button>
        </div>
      </div>
    );
  }

  const data = receipt.receipt_data;
  const date = data.date ? new Date(data.date) : new Date(receipt.created_at);

  if(data.invoice) return <main className="min-h-screen bg-gray-100 p-4"><div className="print:hidden mx-auto mb-4 flex max-w-3xl justify-between"><button type="button" onClick={()=>router.push("/menu")}>Back to menu</button><button type="button" onClick={()=>window.print()}>Print / Save PDF</button></div><InvoiceDocument invoice={data.invoice}/>{data.cash_received!=null && <p className="mx-auto mt-4 max-w-3xl">Cash received: ₱{Number(data.cash_received).toFixed(2)} · Change: ₱{Number(data.change_due??0).toFixed(2)}</p>}</main>;

  return (
    <div className="min-h-screen bg-gray-200 flex flex-col items-center py-10 px-4 font-mono text-gray-800">
      <div className="w-full max-w-sm relative">
        {/* Receipt Container */}
        <div className="bg-white shadow-lg relative p-6 pt-10 pb-8 rounded-sm">
          {/* Jagged top edge effect using radial gradient */}
          <div className="absolute top-0 left-0 w-full h-3 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22><polygon points=%220,0 5,10 10,0%22 fill=%22%23e5e7eb%22/></svg>')] bg-repeat-x rotate-180 -mt-2.5 z-10" />

          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black tracking-widest uppercase mb-1">
              JAYDS CAFE
            </h1>
            <p className="text-sm font-bold mt-4 border-y border-dashed border-gray-400 py-1 uppercase">
              Order receipt
            </p>
          </div>

          {/* Meta Info */}
          <div className="text-xs mb-6 space-y-1">
            <div className="flex justify-between">
              <span>Order #</span>
              <span className="font-bold">{data.order_number || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span>Date</span>
              <span>
                {date.toLocaleDateString("en-PH", {
                  month: "2-digit",
                  timeZone: "Asia/Manila",
                  day: "2-digit",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Time</span>
              <span>
                {date.toLocaleTimeString("en-PH", {
                  hour: "2-digit",
                  timeZone: "Asia/Manila",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>

          {/* Items */}
          <div className="border-t border-dashed border-gray-400 pt-3 pb-4 mb-4">
            <div className="flex justify-between text-xs font-bold mb-2">
              <span className="w-2/3">ITEM</span>
              <span className="w-1/3 text-right">AMT</span>
            </div>
            <div className="space-y-3">
              {data.items?.map((item, idx) => (
                <div key={idx} className="text-xs">
                  <p className="font-semibold leading-tight">{item.name}</p>
                  {item.variants?.length ? (
                    <p className="text-gray-500 mt-1">
                      {item.variants.map((v) => v.label).join(" · ")}
                    </p>
                  ) : null}
                  {item.notes && (
                    <p className="text-gray-500 mt-1">Note: {item.notes}</p>
                  )}
                  <div className="flex justify-between text-gray-600 mt-0.5">
                    <span>
                      {item.qty} x {(item.price / item.qty || 0).toFixed(2)}
                    </span>
                    <span className="font-bold text-gray-800">
                      {(item.price || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="border-t border-b border-dashed border-gray-400 py-3 mb-6 space-y-1">
            {typeof data.subtotal === "number" && (
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>{data.subtotal.toFixed(2)}</span>
              </div>
            )}
            {typeof data.discount === "number" && data.discount > 0 && (
              <div className="flex justify-between text-sm">
                <span>Discount</span>
                <span>− {data.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-black mt-2 pt-2 border-t border-gray-200">
              <span>TOTAL</span>
              <span>₱{(data.total || 0).toFixed(2)}</span>
            </div>
          </div>

          {/* Payment */}
          <div className="text-xs space-y-1 mb-8">
            <div className="flex justify-between">
              <span>Payment Method</span>
              <span className="uppercase">{data.payment_method || "—"}</span>
            </div>
            {typeof data.cash_received === "number" && (
              <div className="flex justify-between">
                <span>Cash received</span>
                <span>{data.cash_received.toFixed(2)}</span>
              </div>
            )}
            {typeof data.change_due === "number" && (
              <div className="flex justify-between">
                <span>Change</span>
                <span>{data.change_due.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="text-center text-[10px] text-gray-500 space-y-1">
            <p className="font-bold text-gray-700">Thank you for visiting!</p>
            <p>Please come again.</p>
            <p className="mt-4 pt-4 border-t border-dashed border-gray-300">
              Receipt Valid Until:{" "}
              {new Date(receipt.expires_at).toLocaleDateString("en-PH", {
                timeZone: "Asia/Manila",
              })}
            </p>
          </div>

          {/* Jagged bottom edge effect */}
          <div className="absolute bottom-0 left-0 w-full h-3 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22><polygon points=%220,0 5,10 10,0%22 fill=%22%23e5e7eb%22/></svg>')] bg-repeat-x -mb-2.5 z-10" />
        </div>

        {/* CTA Section */}
        <div className="mt-8 text-center animate-fade-in-up">
          <p className="text-sm font-semibold text-gray-600 mb-3 font-sans">
            Craving for more?
          </p>
          <button
            onClick={() => router.push("/menu")}
            className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-2xl shadow-xl shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all font-sans text-base"
          >
            ☕ Order via Web App Now!
          </button>
        </div>
      </div>
    </div>
  );
}
