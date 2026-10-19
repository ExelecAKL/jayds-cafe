"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { supabase } from "@cafeos/shared/supabase/client";
import PasswordInput from "../../../components/PasswordInput";
import { Skeleton, SkeletonStatus } from "../../../components/Skeletons";
export default function ResetPasswordPage() {
  const { user, initialized } = useAuth();
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      setMessage(
        "Use at least 8 characters, one uppercase letter and one number.",
      );
      return;
    }
    if (password !== confirmation) {
      setMessage("Passwords do not match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error)
      setMessage(
        "The password could not update. Request a fresh reset link and try again.",
      );
    else {
      setDone(true);
      setMessage("Your password has been updated.");
    }
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <p className="eyebrow">Jayds Café</p>
      <h1 className="page-title mb-6">Set a new password</h1>
      {!initialized ? (
        <SkeletonStatus label="Checking your reset session…" className="grid gap-4">
          <Skeleton width={120} height={12} />
          <Skeleton shape="block" height={48} radius={14} />
          <Skeleton width={150} height={12} />
          <Skeleton shape="block" height={48} radius={14} />
          <Skeleton shape="pill" height={48} className="mt-2" />
        </SkeletonStatus>
      ) : !user ? (
        <p>
          This link has expired or is unavailable.{" "}
          <Link href="/forgot-password" className="underline">
            Request another link
          </Link>
          .
        </p>
      ) : done ? (
        <Link className="btn-primary min-h-12" href="/account">
          Return to your account
        </Link>
      ) : (
        <form className="space-y-4" onSubmit={save}>
          <label className="block">
            New password
            <FieldRequirement required={true} />
            <PasswordInput
              id="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </label>
          <label className="block">
            Confirm password
            <FieldRequirement required={true} />
            <PasswordInput
              id="confirm-new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </label>
          <button className="btn-primary min-h-12 w-full" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm">
          {message}
        </p>
      )}
    </main>
  );
}
