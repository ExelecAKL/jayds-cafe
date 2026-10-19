// apps/admin/app/(admin)/staff/page.tsx
// User list + role assignment

"use client";
import { AdminSelect } from "../../../components/AdminSelect";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import type { Profile, UserRole } from "@cafeos/shared/types";
import { PaginatedTable } from "../../../components/PaginatedTable";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useActionConfirm } from "@cafeos/shared/ui/action-confirm";
import { Feedback, PageHeader } from "../../../components/Operations";
import { TableSkeleton } from "../../../components/AdminSkeletons";
import { notifyAdmin } from "../../../components/AdminToasts";

const ROLES: UserRole[] = ["customer", "staff", "admin"];
const roleColors: Record<UserRole, string> = {
  customer: "bg-info-soft text-info",
  staff: "bg-info-soft text-info",
  admin: "bg-warning-soft text-warning",
};

export default function StaffPage() {
  const { user: currentUser } = useAuth();
  const confirm = useActionConfirm();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) {
      setUsers((data as Profile[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchUsers);
  }, [fetchUsers]);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (processing || userId === currentUser?.id) return;
    const account = users.find((user) => user.id === userId);
    if (!account || account.role === newRole) return;
    setProcessing(true);
    setError("");
    try {
      if (
        !(await confirm({
          title: `Change ${account.full_name || account.email}'s access?`,
          description:
            newRole === "admin"
              ? "Admin can manage prices, stock, settings, and other accounts. Grant this only to a trusted manager."
              : newRole === "staff"
                ? "Staff can use the POS after their account is approved. Admin access will be removed."
                : "Customer can use the customer app. Staff and Admin access will be removed.",
          details: [`Role: ${account.role} → ${newRole}`],
          confirmLabel: "Change access",
          danger: newRole !== "staff",
        }))
      )
        return;
      const { error } = await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", userId);

      if (error) {
        setError("Could not change access. " + error.message);
        return;
      }

      notifyAdmin(`Account role changed to ${newRole}.`, "success");
      await fetchUsers();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="PEOPLE & ACCESS" title="Account roles" description="Manage account permissions. Your own administrator role is protected." />
      <Feedback error={error} />

      <div className="bg-surface rounded-2xl shadow-sm border border-subtle overflow-hidden">
        {loading ? (
          <TableSkeleton
            label="Loading accounts…"
            rows={8}
            columns={["title", "text", "text", "badge", "text"]}
          />
        ) : (
          <div className="overflow-x-auto">
            <PaginatedTable aria-label="Staff" className="w-full">
              <thead>
                <tr className="border-b border-subtle bg-raised">
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-raised transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-action to-action rounded-full flex items-center justify-center text-on-action font-semibold text-sm">
                          {(user.full_name || user.email)
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-ink">
                          {user.full_name || " - "}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {user.phone || " - "}
                    </td>
                    <td className="px-6 py-4">
                      <AdminSelect
                        aria-label={`Role for ${user.full_name || user.email}`}
                        disabled={processing || user.id === currentUser?.id}
                        value={user.role}
                        onChange={(e) =>
                          handleRoleChange(user.id, e.target.value as UserRole)
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/20 ${roleColors[user.role]}`}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r.charAt(0).toUpperCase() + r.slice(1)}
                          </option>
                        ))}
                      </AdminSelect>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">
                      {new Date(user.created_at).toLocaleDateString("en-PH", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </PaginatedTable>

            {users.length === 0 && (
              <div className="p-8 text-center text-muted">
                No users found.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
