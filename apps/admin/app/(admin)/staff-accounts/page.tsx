"use client";
import { PageHeader } from "../../../components/Operations";
import { TableSkeleton } from "../../../components/AdminSkeletons";
import { notifyAdmin } from "../../../components/AdminToasts";
import { AdminSelect } from "../../../components/AdminSelect";

import { useState, useEffect } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { PaginatedTable } from "../../../components/PaginatedTable";
import { useActionConfirm } from "@cafeos/shared/ui/action-confirm";

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: "admin" | "staff" | "customer";
  is_approved: boolean;
  created_at: string;
};

export default function StaffAccountsPage() {
  const confirm = useActionConfirm();
  const { profile: currentUser } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const maskEmail = (email: string | null) => {
    if (!email) return "No email provided";
    const [local, domain] = email.split("@");
    if (!domain) return email;
    if (local.length <= 2) return `${local[0]}***@${domain}`;
    return `${local.substring(0, 2)}***@${domain}`;
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fetchProfiles = async () => {
    setLoading(true);
    // Only fetch staff and admin accounts  -  customers are excluded
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .in("role", ["staff", "admin"])
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
    } else if (data) {
      setProfiles(data as Profile[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void Promise.resolve().then(fetchProfiles);
  }, []);

  const changeRole = async (
    userId: string,
    newRole: "admin" | "staff" | "customer",
  ) => {
    if (processingId || userId === currentUser?.id) return;

    setProcessingId(userId);
    setError("");

    const account = profiles.find((p) => p.id === userId);
    if (
      !(await confirm({
        title: "Change this account's access?",
        description:
          newRole === "admin"
            ? "Admin can manage prices, stock, settings, and other accounts. Grant this only to a trusted manager."
            : newRole === "customer"
              ? "This removes staff and Admin access. Their customer account stays available."
              : "This grants POS access after approval and removes Admin access.",
        details: [
          account?.full_name || "Account",
          `Role: ${account?.role} → ${newRole}`,
        ],
        confirmLabel: "Change access",
        danger: true,
      }))
    ) {
      setProcessingId(null);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);

    if (error) {
      setError(`Failed to update role: ${error.message}`);
    } else {
      const person =
        profiles.find((p) => p.id === userId)?.full_name || "Account";
      notifyAdmin(
        newRole === "customer"
          ? `${person} no longer has staff access.`
          : `${person} is now ${newRole === "admin" ? "an Admin" : "Staff"}.`,
        "success",
      );
      if (newRole === "customer") {
        setProfiles((prev) => prev.filter((p) => p.id !== userId));
      } else {
        setProfiles((prev) =>
          prev.map((p) => (p.id === userId ? { ...p, role: newRole } : p)),
        );
      }
    }

    setProcessingId(null);
  };

  const approveStaff = async (userId: string) => {
    if (processingId) return;
    setProcessingId(userId);
    setError("");

    const account = profiles.find((p) => p.id === userId);
    if (
      !(await confirm({
        title: "Approve this employee's access?",
        description:
          "Confirm that this is the correct person and role before allowing them to sign in.",
        details: [
          account?.full_name || "Account",
          `Access: ${account?.role === "admin" ? "Admin  -  can manage the entire café" : "Staff  -  can use the POS"}`,
        ],
        confirmLabel: "Approve access",
      }))
    ) {
      setProcessingId(null);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ is_approved: true })
      .eq("id", userId);

    if (error) {
      setError(`Failed to approve: ${error.message}`);
    } else {
      notifyAdmin(
        `${account?.full_name || "The account"} can now sign in.`,
        "success",
      );
      setProfiles((prev) =>
        prev.map((p) => (p.id === userId ? { ...p, is_approved: true } : p)),
      );
    }

    setProcessingId(null);
  };

  const rejectStaff = async (userId: string) => {
    if (processingId) return;
    setProcessingId(userId);
    setError("");

    if (
      !(await confirm({
        title: "Decline this staff request?",
        description:
          "This account will become a Customer account. It will not have staff or Admin access.",
        details: [
          profiles.find((p) => p.id === userId)?.full_name || "Account",
        ],
        confirmLabel: "Decline request",
        danger: true,
      }))
    ) {
      setProcessingId(null);
      return;
    }

    // Reject = demote to customer and remove from list
    const { error } = await supabase
      .from("profiles")
      .update({ role: "customer", is_approved: true })
      .eq("id", userId);

    if (error) {
      setError(`Failed to reject: ${error.message}`);
    } else {
      const declined = profiles.find((p) => p.id === userId)?.full_name;
      notifyAdmin(
        declined
          ? `Declined ${declined}’s staff request.`
          : "Staff request declined.",
        "info",
      );
      setProfiles((prev) => prev.filter((p) => p.id !== userId));
    }

    setProcessingId(null);
  };

  const pendingProfiles = profiles.filter((p) => !p.is_approved);
  const approvedProfiles = profiles.filter((p) => p.is_approved);

  return (
    <div>
      <PageHeader eyebrow="PEOPLE & ACCESS" title="Staff access" description="Review employee requests and manage approved access." />

      {error && (
        <div className="bg-danger-soft text-danger p-4 rounded-xl border border-danger-border mb-6">
          {error}
        </div>
      )}

      {/* Pending Approvals Section */}
      {pendingProfiles.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-ink mb-3 flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-warning rounded-full animate-pulse" />
            Pending Approval ({pendingProfiles.length})
          </h2>
          <div className="space-y-3">
            {pendingProfiles.map((profile) => {
              const isProcessing = processingId === profile.id;
              return (
                <div
                  key={profile.id}
                  className="staff-approval-card bg-warning-soft border border-warning-border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-action to-action flex items-center justify-center text-on-action font-bold flex-shrink-0">
                      {(profile.full_name || profile.email || "U")
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">
                        {profile.full_name || "Unnamed User"}
                      </p>
                      <p className="text-xs text-muted font-mono truncate">
                        {revealedIds.has(profile.id)
                          ? profile.email
                          : maskEmail(profile.email)}
                        {profile.email && (
                          <button
                            onClick={() => toggleReveal(profile.id)}
                            className="ml-1.5 text-xs bg-raised hover:bg-raised text-muted px-1.5 py-0.5 rounded"
                          >
                            {revealedIds.has(profile.id) ? "Hide" : "Reveal"}
                          </button>
                        )}
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        Applied{" "}
                        {new Date(profile.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => approveStaff(profile.id)}
                      disabled={isProcessing}
                      className="px-4 py-2 text-sm font-semibold bg-success text-on-action rounded-xl hover:bg-success disabled:opacity-50 transition-all"
                    >
                      Approve access
                    </button>
                    <button
                      onClick={() => rejectStaff(profile.id)}
                      disabled={isProcessing}
                      className="px-4 py-2 text-sm font-semibold bg-danger-soft text-danger rounded-xl hover:bg-danger-soft disabled:opacity-50 transition-all"
                    >
                      Decline request
                    </button>
                    {isProcessing && (
                      <span className="ops-refresh-note" role="status">
                        Saving…
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Approved Staff Table */}
      <div className="bg-surface rounded-2xl shadow-sm border border-subtle overflow-hidden">
        {loading ? (
          <TableSkeleton
            label="Loading staff accounts…"
            rows={6}
            columns={["title", "badge", "text", "action"]}
          />
        ) : (
          <div className="overflow-x-auto">
            <PaginatedTable aria-label="Staff accounts" className="w-full">
              <thead>
                <tr className="border-b border-subtle bg-raised">
                  <th className="px-6 py-4 text-left text-xs font-medium text-muted uppercase">
                    User
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-muted uppercase">
                    Current Role
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-muted uppercase">
                    Registered On
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-muted uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {approvedProfiles.map((profile) => {
                  const isMe = profile.id === currentUser?.id;
                  const isProcessing = processingId === profile.id;

                  return (
                    <tr key={profile.id} className="hover:bg-raised">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-action to-action flex items-center justify-center text-on-action font-bold">
                            {(profile.full_name || profile.email || "U")
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-ink">
                              {profile.full_name || "Unnamed User"}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-xs text-muted font-mono">
                                {revealedIds.has(profile.id)
                                  ? profile.email
                                  : maskEmail(profile.email)}
                              </p>
                              {profile.email && (
                                <button
                                  onClick={() => toggleReveal(profile.id)}
                                  className="text-xs bg-raised hover:bg-raised text-muted px-1.5 py-0.5 rounded transition-colors"
                                >
                                  {revealedIds.has(profile.id)
                                    ? "Hide"
                                    : "Reveal"}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 text-xs font-bold uppercase rounded-full ${
                            profile.role === "admin"
                              ? "bg-warning-soft text-warning"
                              : "bg-info-soft text-info"
                          }`}
                        >
                          {profile.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted">
                        {new Date(profile.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <AdminSelect
                            aria-label={`Role for ${profile.full_name || profile.email || "employee"}`}
                            value={profile.role}
                            onChange={(e) =>
                              changeRole(
                                profile.id,
                                e.target.value as
                                  "admin" | "staff" | "customer",
                              )
                            }
                            disabled={isMe || isProcessing}
                            className="text-sm border border-subtle rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-accent outline-none disabled:opacity-50 disabled:bg-raised"
                          >
                            <option value="staff">Staff</option>
                            <option value="admin">Admin</option>
                            <option value="customer">Demote to Customer</option>
                          </AdminSelect>
                          {isMe && (
                            <span className="text-xs text-warning font-medium bg-warning-soft px-2 py-1 rounded-md">
                              You (Locked)
                            </span>
                          )}
                          {isProcessing && (
                            <span className="ops-refresh-note ml-2" role="status">
                              Saving…
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </PaginatedTable>
            {approvedProfiles.length === 0 && !loading && (
              <div className="p-12 text-center text-muted">
                No staff accounts found.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
