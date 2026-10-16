"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useActionConfirm } from "@cafeos/shared/ui/action-confirm";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import type {
  BranchAdminSettings,
  BranchHours,
} from "@cafeos/shared/customer/types";
import { Feedback, PageHeader } from "./Operations";
import { withRequestDeadline } from "@cafeos/shared/utils/request";

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
    try {
      const { data, error: failure } = await withRequestDeadline((signal) =>
        supabase.rpc("get_customer_scheduling_admin").abortSignal(signal),
      );
      if (failure) throw new Error(failure.message);
      const result = data as {
        settings: BranchAdminSettings;
        production_ready: boolean;
      };
      setSettings(result.settings);
      setHours(result.settings.regular_hours);
      setClosures(result.settings.closure_dates.join("\n"));
      setProductionReady(result.production_ready);
      setError("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Settings could not load. Try again.",
      );
    }
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
          opens: current?.opens ?? "13:00",
          closes: current?.closes ?? "22:00",
          ...change,
        },
      ];
    });
  return (
    <>
      <PageHeader
        eyebrow="CUSTOMER OPERATIONS"
        title="Hours & pickup"
        description="Manage opening times and customer pickup."
      />
      <Feedback error={error} success={success} />
      {!settings ? (
        <div className="ops-form-section">
          <p className="ops-description" role="status">
            {error
              ? "Branch settings could not load."
              : "Loading branch settings…"}
          </p>
          {error && (
            <button className="ops-button" onClick={() => void load()}>
              Try again
            </button>
          )}
        </div>
      ) : (
        <>
          <form
            className="ops-form"
            onSubmit={save}
            onInvalidCapture={(event) => {
              const details = (event.target as HTMLElement).closest("details");
              if (details) details.open = true;
            }}
          >
            <section className="ops-form-section">
              <div
                className="ops-panel-header"
                style={{ padding: 0, border: 0 }}
              >
                <div>
                  <h2>Opening hours</h2>
                  <p>Philippine time</p>
                </div>
              </div>
              <div className="ops-hour-shortcuts">
                <button
                  type="button"
                  className="ops-button small"
                  disabled={!hours.length}
                  onClick={() =>
                    setHours((previous) =>
                      previous.map((day) => ({
                        ...day,
                        opens: "13:00",
                        closes: "22:00",
                      })),
                    )
                  }
                >
                  Use 1 PM–10 PM for open days
                </button>
              </div>
              {weekdays.map((name, weekday) => {
                const day = hours.find((h) => h.weekday === weekday);
                return (
                  <div className="ops-day-row" key={weekday}>
                    <label className="ops-day-toggle">
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
                      {name}
                    </label>
                    {day ? (
                      <>
                        <label>
                          Opens
                          <FieldRequirement required={true} />
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
                          <FieldRequirement required={true} />
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
                    ) : (
                      <span className="ops-day-closed">Closed</span>
                    )}
                  </div>
                );
              })}
              <label>
                Full-day closures
                <FieldRequirement required={false} />
                <textarea
                  rows={3}
                  value={closures}
                  onChange={(event) => setClosures(event.target.value)}
                  placeholder="YYYY-MM-DD, one date per line"
                />
                <small>
                  One date per line. Accepted bookings stay visible for review.
                </small>
              </label>
            </section>
            <section className="ops-form-section">
              <h2>Pickup limits</h2>
              <div className="ops-form-grid">
                <label>
                  Orders per 15-minute window
                  <FieldRequirement
                    required={settings.scheduled_pickup_enabled}
                  />
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
                  <FieldRequirement
                    required={settings.scheduled_pickup_enabled}
                  />
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
                  <FieldRequirement required={true} />
                  <input
                    type="number"
                    min={20}
                    required
                    {...numeric("minimum_notice_minutes")}
                  />
                </label>
                <label>
                  Preparation lead (minutes)
                  <FieldRequirement required={true} />
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
                  <FieldRequirement required={false} />
                </span>
                <small>
                  Maya prepayment, today and tomorrow only. Production
                  verification and both capacities are required.
                </small>
              </label>
            </section>
            <details className="ops-disclosure">
              <summary>Branch & delivery settings</summary>
              <div className="ops-form" style={{ paddingBottom: 20 }}>
                <div className="ops-form-grid">
                  <label>
                    Branch name
                    <FieldRequirement required={true} />
                    <input required minLength={2} {...field("name")} />
                  </label>
                  <label>
                    Address
                    <FieldRequirement required={true} />
                    <input required minLength={5} {...field("address")} />
                  </label>
                  <label>
                    Latitude
                    <FieldRequirement required={true} />
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
                    <FieldRequirement required={true} />
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
                    <FieldRequirement required={true} />
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
                    <FieldRequirement required={false} />
                    <input {...field("contact_phone")} />
                  </label>
                </div>
              </div>
            </details>
            <div className="ops-form-actions ops-sticky-actions">
              <button
                className="ops-button primary"
                disabled={busy}
                type="submit"
              >
                {busy ? "Saving…" : "Save settings"}
              </button>
            </div>
          </form>
          <details className="ops-disclosure" style={{ marginTop: 20 }}>
            <summary>
              Stock & recipe verification ·{" "}
              {productionReady ? "Verified" : "Action needed"}
            </summary>
            <section className="ops-form" style={{ paddingBottom: 20 }}>
              <p className="ops-description">
                {productionReady
                  ? "Actual stock and recipe verification is current."
                  : "Verify physical counts and recipe portions before enabling scheduled pickup."}
              </p>
              <p className="ops-description">
                Review <Link href="/inventory">Stock & recipes</Link>, then
                record what you checked below.
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
                <FieldRequirement required={true} />
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
          </details>
        </>
      )}
    </>
  );
}
