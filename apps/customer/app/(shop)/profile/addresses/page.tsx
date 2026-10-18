"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { supabase } from "@cafeos/shared/supabase/client";
import AppShell, { InlineNotice } from "../../../../components/AppShell";
import DeliveryMapPickerLazy from "../../../../components/DeliveryMapPickerLazy";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import { coordinates } from "../../../../lib/location";
interface Address {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
}
export default function Addresses() {
  const { user, initialized } = useAuth(),
    [addresses, setAddresses] = useState<Address[]>([]),
    [editing, setEditing] = useState<string | null>(null),
    [label, setLabel] = useState(""),
    [destination, setDestination] = useState<{
      lat: number;
      lng: number;
      address: string;
    } | null>(null),
    [mapOpen, setMapOpen] = useState(false),
    [form, setForm] = useState(false),
    [removing, setRemoving] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("saved_addresses")
      .select("id,label,address,lat,lng")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) setError("Saved addresses could not load. Please retry.");
    else setAddresses(data ?? []);
  }, [user]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (
      !user ||
      !label.trim() ||
      !destination ||
      !coordinates(destination.lat, destination.lng) ||
      !destination.address.trim()
    ) {
      setError("Enter a label and choose a complete destination.");
      return;
    }
    setBusy(true);
    const data = {
        label: label.trim(),
        address: destination.address.trim(),
        lat: destination.lat,
        lng: destination.lng,
      },
      result = editing
        ? await supabase
            .from("saved_addresses")
            .update(data)
            .eq("id", editing)
            .eq("user_id", user.id)
        : await supabase
            .from("saved_addresses")
            .insert({ ...data, user_id: user.id });
    setBusy(false);
    if (result.error) {
      setError("Your address could not save. Your entries are retained.");
      return;
    }
    setForm(false);
    setNotice("Address saved.");
    void load();
  }
  async function remove() {
    if (!user || !removing) return;
    setBusy(true);
    const { error } = await supabase
      .from("saved_addresses")
      .delete()
      .eq("id", removing)
      .eq("user_id", user.id);
    setBusy(false);
    if (error) {
      setError("Address could not be removed. Please retry.");
      return;
    }
    setRemoving(null);
    setNotice("Address removed.");
    void load();
  }
  return (
    <AppShell
      title="Saved addresses"
      backHref="/account"
      description="Choose a destination once. Use it at checkout."
    >
      {!initialized ? (
        <p>Loading your account…</p>
      ) : !user ? (
        <InlineNotice>Sign in to save private delivery addresses.</InlineNotice>
      ) : (
        <>
          <button
            className="btn-primary min-h-12 mb-5"
            onClick={() => {
              setEditing(null);
              setLabel("");
              setDestination(null);
              setForm(true);
              setError("");
            }}
          >
            Add address
          </button>
          {error && <InlineNotice tone="error">{error}</InlineNotice>}
          {notice && <InlineNotice tone="success">{notice}</InlineNotice>}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {addresses.map((a) => (
              <article className="surface-card p-5" key={a.id}>
                <h2 className="text-lg font-semibold">{a.label}</h2>
                <p className="mt-2 text-sm text-text-secondary">{a.address}</p>
                <div className="mt-4 flex gap-3">
                  <button
                    className="btn-secondary min-h-12"
                    onClick={() => {
                      setEditing(a.id);
                      setLabel(a.label);
                      setDestination(a);
                      setForm(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="min-h-12 px-3 text-sm text-red-800"
                    onClick={() => setRemoving(a.id)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
          {form && (
            <form
              className="surface-card mt-6 max-w-xl space-y-4 p-5"
              onSubmit={save}
            >
              <h2 className="text-xl font-semibold">
                {editing ? "Edit destination" : "New destination"}
              </h2>
              <label className="block text-sm">
                Label
                <FieldRequirement required={true} />
                <input
                  className="input-field w-full"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Home, office…"
                  maxLength={80}
                  required
                />
              </label>
              <button
                type="button"
                className="btn-secondary min-h-12 w-full"
                onClick={() => setMapOpen(true)}
              >
                Choose on map
              </button>
              {destination && (
                <label className="block text-sm">
                  Complete address
                  <FieldRequirement required={true} />
                  <input
                    className="input-field w-full"
                    value={destination.address}
                    readOnly
                    onClick={() => setMapOpen(true)}
                    maxLength={500}
                    required
                  />
                </label>
              )}
              <div className="flex gap-3">
                <button className="btn-primary min-h-12" disabled={busy}>
                  {busy ? "Saving…" : "Save destination"}
                </button>
                <button
                  type="button"
                  className="btn-secondary min-h-12"
                  onClick={() => setForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <ConfirmDialog
            open={!!removing}
            title="Remove this saved address?"
            confirmLabel="Remove address"
            busy={busy}
            onConfirm={() => void remove()}
            onCancel={() => setRemoving(null)}
          >
            <p>Your existing order records are preserved.</p>
          </ConfirmDialog>
          {mapOpen && (
            <DeliveryMapPickerLazy
              lat={destination?.lat ?? 14.346621}
              lng={destination?.lng ?? 120.981057}
              initialAddress={destination?.address}
              onClose={() => setMapOpen(false)}
              onLocationChange={(lat, lng, address) => {
                setDestination({ lat, lng, address });
                setMapOpen(false);
              }}
            />
          )}
        </>
      )}
    </AppShell>
  );
}
