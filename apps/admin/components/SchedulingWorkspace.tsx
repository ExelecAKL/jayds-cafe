"use client";
import { useActionConfirm } from "@cafeos/shared/ui/action-confirm";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import type {
  BranchAdminSettings,
  BranchHours,
} from "@cafeos/shared/customer/types";
import { Feedback, PageHeader } from "./Operations";

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export default function SchedulingWorkspace() {
  const confirm = useActionConfirm();
  const [settings, setSettings] = useState<BranchAdminSettings | null>(null);
  const [productionReady, setProductionReady] = useState(false);
  const [hours, setHours] = useState<BranchHours[]>([]);
  const [closures, setClosures] = useState("");
  const [verification, setVerification] = useState("");
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error: failure } = await supabase.rpc(
      "get_customer_scheduling_admin",
    );
    if (failure) {
      setError(failure.message);
      return;
    }
    const result = data as {
      settings: BranchAdminSettings;
      production_ready: boolean;
    };
    setSettings(result.settings);
    setHours(result.settings.regular_hours);
    setClosures(result.settings.closure_dates.join("\n"));
    setProductionReady(result.production_ready);
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const run = async (
    operation: () => PromiseLike<{
      error: { message: string } | null;
      cancelled?: boolean;
    }>,
    message: string,
  ) => {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await operation();
      if (result.cancelled) return;
      if (result.error) throw new Error(result.error.message);
      await load();
      setSuccess(message);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The settings could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!settings || busy) return;
    const dates = [...new Set(closures.split(/[\s,]+/).filter(Boolean))];
    void run(async () => {
      if (
        !(await confirm({
          title: "Save hours & pickup settings?",
          description:
            "These settings determine when customers can book and whether their address is within delivery coverage. Existing accepted bookings remain for staff review.",
          details: [
            `Branch: ${settings.name}`,
            `Scheduled pickup: ${settings.scheduled_pickup_enabled ? "Enabled" : "Disabled"}`,
            `Open days: ${hours.length} · Full-day closures: ${dates.length}`,
            `Pickup limits: ${settings.slot_order_capacity ?? "Not set"} orders / ${settings.slot_item_capacity ?? "Not set"} items per 15 minutes`,
          ],
          confirmLabel: "Save settings",
        }))
      )
        return { error: null, cancelled: true };
      return supabase.rpc("customer_save_branch_settings", {
        p_settings: { ...settings, regular_hours: hours, closure_dates: dates },
      });
    }, "Branch and pickup settings saved.");
  };
  const field = (key: "name" | "address" | "contact_phone") => ({
    value: settings?.[key] ?? "",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setSettings(
        (previous) => previous && { ...previous, [key]: event.target.value },
      ),
  });
  const numeric = (
    key:
      | "latitude"
      | "longitude"
      | "delivery_radius_km"
      | "slot_order_capacity"
      | "slot_item_capacity"
      | "minimum_notice_minutes"
      | "preparation_lead_minutes",
  ) => ({
    value: settings?.[key] ?? "",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setSettings(
        (previous) =>
          previous && {
            ...previous,
            [key]:
              event.target.value === "" ? null : Number(event.target.value),
          },
      ),
  });
  const setDay = (weekday: number, change: Partial<BranchHours>) =>
    setHours((previous) => {
      const current = previous.find((h) => h.weekday === weekday);
      return [
        ...previous.filter((h) => h.weekday !== weekday),
        {
          weekday,
          opens: current?.opens ?? "",
          closes: current?.closes ?? "",
          ...change,
        },
      ];
    });
  return (
    <>
      <PageHeader
        eyebrow="CUSTOMER OPERATIONS"
        title="Hours & pickup"
        description="Set actual operating hours, closures and both pickup capacities before enabling customer bookings."
      />
      <Feedback error={error} success={success} />
      {!settings ? (
        <p className="ops-description">
          {error
            ? "Apply the customer scheduling upgrade, then reload this page."
            : "Loading branch settings…"}
        </p>
      ) : (
        <>
          <form className="ops-form" onSubmit={save}>
            <h2>Branch information</h2>
            <div className="ops-form-grid">
              <label>
                Branch name
                <input required minLength={2} {...field("name")} />
              </label>
              <label>
                Address
                <input required minLength={5} {...field("address")} />
              </label>
              <label>
                Latitude
                <input
                  required
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  {...numeric("latitude")}
                />
              </label>
              <label>
                Longitude
                <input
                  required
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  {...numeric("longitude")}
                />
              </label>
              <label>
                Delivery radius (km)
                <input
                  required
                  type="number"
                  step="0.1"
                  min={0.1}
                  max={100}
                  {...numeric("delivery_radius_km")}
                />
              </label>
              <label>
                Public contact phone
                <input {...field("contact_phone")} />
              </label>
            </div>
            <h2>Actual hours · Asia/Manila</h2>
            <p className="ops-description">
              All days begin closed. Enter the café’s real same-day opening and
              closing times. Only complete 15-minute pickup windows are offered.
            </p>
            {weekdays.map((name, weekday) => {
              const day = hours.find((h) => h.weekday === weekday);
              return (
                <div
                  className="ops-form-grid"
                  key={weekday}
                  style={{ marginBottom: 12 }}
                >
                  <label>
                    <span>
                      <input
                        type="checkbox"
                        checked={!!day}
                        onChange={(event) =>
                          event.target.checked
                            ? setDay(weekday, {})
                            : setHours((previous) =>
                                previous.filter((h) => h.weekday !== weekday),
                              )
                        }
                      />{" "}
                      {name} open
                    </span>
                  </label>
                  {day && (
                    <>
                      <label>
                        Opens
                        <input
                          type="time"
                          required
                          value={day.opens}
                          onChange={(event) =>
                            setDay(weekday, { opens: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Closes
                        <input
                          type="time"
                          required
                          value={day.closes}
                          onChange={(event) =>
                            setDay(weekday, { closes: event.target.value })
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
              );
            })}
            <label>
              Full-day closures
              <textarea
                rows={3}
                value={closures}
                onChange={(event) => setClosures(event.target.value)}
                placeholder="YYYY-MM-DD, one date per line"
              />
              <small>
                Bookings already accepted remain visible for staff review when
                hours or closures change.
              </small>
            </label>
            <h2>Pickup limits</h2>
            <div className="ops-form-grid">
              <label>
                Orders per 15-minute window
                <input
                  type="number"
                  min={1}
                  required={settings.scheduled_pickup_enabled}
                  {...numeric("slot_order_capacity")}
                />
                <small>Enter the actual order limit.</small>
              </label>
              <label>
                Item units per 15-minute window
                <input
                  type="number"
                  min={1}
                  required={settings.scheduled_pickup_enabled}
                  {...numeric("slot_item_capacity")}
                />
                <small>
                  Quantities are summed across all items in each order.
                </small>
              </label>
              <label>
                Minimum notice (minutes)
                <input
                  type="number"
                  min={20}
                  required
                  {...numeric("minimum_notice_minutes")}
                />
              </label>
              <label>
                Preparation lead (minutes)
                <input
                  type="number"
                  min={1}
                  max={settings.minimum_notice_minutes - 1}
                  required
                  {...numeric("preparation_lead_minutes")}
                />
                <small>Must be shorter than the minimum notice.</small>
              </label>
            </div>
            <label>
              <span>
                <input
                  type="checkbox"
                  checked={settings.scheduled_pickup_enabled}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      scheduled_pickup_enabled: event.target.checked,
                    })
                  }
                />{" "}
                Enable scheduled pickup
              </span>
              <small>
                Maya prepayment, today and tomorrow only. Production
                verification and both capacities are required.
              </small>
            </label>
            <div className="ops-form-actions">
              <button
                className="ops-button primary"
                disabled={busy}
                type="submit"
              >
                {busy ? "Saving…" : "Save settings"}
              </button>
            </div>
          </form>
          <section className="ops-form" style={{ marginTop: 28 }}>
            <h2>Production verification</h2>
            <p className="ops-description">
              {productionReady
                ? "Actual stock and recipe verification is current."
                : "Production verification is required. Demo opening quantities and the four SAMPLE frappe recipes are not certified café stock or portions."}
            </p>
            <p className="ops-description">
              Post current physical counts in{" "}
              <Link href="/inventory">Stock & recipes</Link>, review base units,
              real portions and option recipes, then record your verification.
              Existing demo activation is retained. Recipe or unit changes
              require verification again.
            </p>
            {settings.production_verified_at && (
              <p className="ops-description">
                Last verification:{" "}
                {new Date(settings.production_verified_at).toLocaleString(
                  "en-PH",
                  { timeZone: "Asia/Manila" },
                )}
              </p>
            )}
            <label>
              Verification record
              <textarea
                rows={3}
                minLength={20}
                value={verification}
                onChange={(event) => setVerification(event.target.value)}
                placeholder="Describe the physical counts and actual recipe portions you verified."
              />
            </label>
            <div className="ops-form-actions">
              <button
                className="ops-button primary"
                disabled={busy || verification.trim().length < 20}
                onClick={() =>
                  void run(
                    () =>
                      supabase.rpc("customer_verify_production", {
                        p_reason: verification,
                      }),
                    "Production verification recorded. You can now enable configured pickup windows.",
                  )
                }
              >
                Record production verification
              </button>
            </div>
          </section>
        </>
      )}
    </>
  );
}
