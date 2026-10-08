// apps/admin/app/(admin)/staff/page.tsx
// User list + role assignment

"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@cafeos/shared/supabase/client";
import type { Profile, UserRole } from "@cafeos/shared/types";
import { PaginatedTable } from "../../../components/PaginatedTable";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useActionConfirm } from "@cafeos/shared/ui/action-confirm";
import { Feedback } from "../../../components/Operations";

const ROLES: UserRole[] = ["customer", "staff", "admin"];
const roleColors: Record<UserRole, string> = {
  customer: "bg-blue-50 text-blue-700",
  staff: "bg-purple-50 text-purple-700",
  admin: "bg-amber-50 text-amber-700",
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

      await fetchUsers();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Account roles</h1>
      <p className="text-gray-500 mb-6">
        All customer and employee accounts. Use Staff access to approve pending
        employees. Your own Admin role is locked to prevent accidental lockout.
      </p>
      <Feedback error={error} />

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 mx-auto border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <PaginatedTable aria-label="Staff" className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                          {(user.full_name || user.email)
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {user.full_name || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {user.phone || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <select
                        aria-label={`Role for ${user.full_name || user.email}`}
                        disabled={processing || user.id === currentUser?.id}
                        value={user.role}
                        onChange={(e) =>
                          handleRoleChange(user.id, e.target.value as UserRole)
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${roleColors[user.role]}`}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r.charAt(0).toUpperCase() + r.slice(1)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
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
              <div className="p-8 text-center text-gray-400">
                No users found.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
