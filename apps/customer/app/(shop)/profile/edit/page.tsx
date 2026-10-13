"use client";
import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import PasswordInput from "../../../../components/PasswordInput";
import AppShell, { InlineNotice } from "../../../../components/AppShell";
import { getCustomerAuthErrorMessage } from "../../../../utils/authMessages";
import {
  normalizeContactPhone,
  isValidContactPhone,
} from "@cafeos/shared/customer/phone";
export default function EditProfilePage() {
  const { user } = useAuth();
  return <ProfileForm key={user?.id ?? "guest"} />;
}
function ProfileForm() {
  const router = useRouter();
  const { user, profile, session, initialized } = useAuth();
  const lifecycle = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    return () => controller.abort();
  }, []);
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [currentPassword, setCurrentPassword] = useState(""),
    [password, setPassword] = useState(""),
    [confirmPassword, setConfirmPassword] = useState(""),
    [saving, setSaving] = useState(false),
    [changing, setChanging] = useState(false),
    [profileMessage, setProfileMessage] = useState<{
      error: boolean;
      text: string;
    } | null>(null),
    [passwordMessage, setPasswordMessage] = useState<{
      error: boolean;
      text: string;
    } | null>(null),
    [populatedFor, setPopulatedFor] = useState("");
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (
        active &&
        profile?.id === user?.id &&
        profile &&
        populatedFor !== profile.id
      ) {
        setName(profile.full_name ?? "");
        setPhone(profile.phone ?? "");
        setPopulatedFor(profile.id);
      }
    });
    return () => {
      active = false;
    };
  }, [profile, populatedFor, user?.id]);
  useEffect(() => {
    if (initialized && !user) router.replace("/login");
  }, [initialized, user, router]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const controller = lifecycle.current;
    if (!user || saving || !controller || controller.signal.aborted) return;
    setProfileMessage(null);
    if (!name.trim() || name.trim().length > 120) {
      setProfileMessage({
        error: true,
        text: "Enter your name using up to 120 characters.",
      });
      return;
    }
    const normalizedPhone = normalizeContactPhone(phone);
    if (!isValidContactPhone(normalizedPhone)) {
      setProfileMessage({
        error: true,
        text: "Enter a valid phone number so the delivery rider can contact you.",
      });
      return;
    }
    setSaving(true);
    try {
      if (!session || session.user.id !== user.id)
        throw new Error("Your account changed. Please reload this page.");
      const isolated = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
          global: {
            headers: { Authorization: `Bearer ${session.access_token}` },
          },
        },
      );
      const { error } = await isolated
        .from("profiles")
        .update({
          full_name: name.trim(),
          phone: normalizedPhone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        .abortSignal(controller.signal);
      if (error)
        throw new Error(
          "Your details could not be saved. Reconnect and try again.",
        );
      if (controller.signal.aborted) return;
      window.dispatchEvent(
        new CustomEvent("jayds-profile-updated", {
          detail: { userId: user.id },
        }),
      );
      setProfileMessage({ error: false, text: "Your details were saved." });
    } catch (e) {
      setProfileMessage({
        error: true,
        text:
          e instanceof Error ? e.message : "Your details could not be saved.",
      });
    } finally {
      setSaving(false);
    }
  };
  const change = async (event: React.FormEvent) => {
    event.preventDefault();
    const controller = lifecycle.current;
    if (!user?.email || changing || !controller || controller.signal.aborted)
      return;
    setPasswordMessage(null);
    if (!currentPassword) {
      setPasswordMessage({
        error: true,
        text: "Enter your current password to confirm this change.",
      });
      return;
    }
    if (password.length < 8) {
      setPasswordMessage({
        error: true,
        text: "Use at least 8 characters for your new password.",
      });
      return;
    }
    if (password !== confirmPassword) {
      setPasswordMessage({
        error: true,
        text: "The new passwords do not match.",
      });
      return;
    }
    setChanging(true);
    try {
      if (!session || session.user.id !== user.id)
        throw new Error("Your account changed. Please reload this page.");
      const isolated = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      );
      try {
        const { error: verifyError } = await isolated.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });
        if (verifyError)
          throw new Error("Your current password could not be verified.");
        if (controller.signal.aborted) return;
        const { error } = await isolated.auth.updateUser({ password });
        if (error) throw new Error(getCustomerAuthErrorMessage(error.message));
      } finally {
        // This client never writes browser storage or changes the app's active account.
        await isolated.auth.signOut({ scope: "local" }).catch(() => {});
      }
      if (controller.signal.aborted) return;
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      setPasswordMessage({ error: false, text: "Your password was changed." });
    } catch (e) {
      setPasswordMessage({
        error: true,
        text: e instanceof Error ? e.message : "Password could not be changed.",
      });
    } finally {
      setChanging(false);
    }
  };
  return (
    <AppShell
      title="The details that make it yours."
      eyebrow="Personal details"
      backHref="/account"
    >
      {!initialized || !user ? (
        <div className="skeleton h-72" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={save}
            className="rounded-3xl border border-border bg-bg-card p-6"
          >
            <h2 className="section-title">Personal information</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Your phone is optional here. A recipient number is required for
              delivery.
            </p>
            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="profile-name"
                  className="mb-2 block text-sm font-semibold"
                >
                  Full name
                  <FieldRequirement required={true} />
                </label>
                <input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  maxLength={120}
                  required
                  className="w-full rounded-xl border border-border bg-bg-primary p-3"
                />
              </div>
              <div>
                <label
                  htmlFor="profile-phone"
                  className="mb-2 block text-sm font-semibold"
                >
                  Phone number <FieldRequirement required={true} />
                </label>
                <input
                  id="profile-phone"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  autoComplete="tel"
                  maxLength={25}
                  placeholder="09XX XXX XXXX"
                  className="w-full rounded-xl border border-border bg-bg-primary p-3"
                />
              </div>
              <div>
                <label
                  htmlFor="profile-email"
                  className="mb-2 block text-sm font-semibold"
                >
                  Email
                  <span className="ml-1 font-normal">(read-only)</span>
                </label>
                <input
                  id="profile-email"
                  value={user.email ?? ""}
                  readOnly
                  type="email"
                  className="w-full rounded-xl border border-border bg-bg-elevated p-3 text-text-secondary"
                />
                <p className="mt-2 text-xs text-text-secondary">
                  Your account email is used for sign-in and recovery.
                </p>
              </div>
            </div>
            {profileMessage && (
              <div className="mt-5">
                <InlineNotice tone={profileMessage.error ? "error" : "success"}>
                  {profileMessage.text}
                </InlineNotice>
              </div>
            )}
            <button
              type="submit"
              className="btn-primary mt-6 w-full"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save details"}
            </button>
          </form>
          <div className="space-y-6">
            <form
              onSubmit={change}
              className="rounded-3xl border border-border bg-bg-card p-6"
            >
              <h2 className="section-title">Change password</h2>
              <p className="mt-2 text-sm text-text-secondary">
                Use at least 8 characters. Your password manager can help.
              </p>
              <div className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="profile-current-password"
                    className="mb-2 block text-sm font-semibold"
                  >
                    Current password
                    <FieldRequirement required={true} />
                  </label>
                  <PasswordInput
                    id="profile-current-password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="profile-new-password"
                    className="mb-2 block text-sm font-semibold"
                  >
                    New password
                    <FieldRequirement required={true} />
                  </label>
                  <PasswordInput
                    id="profile-new-password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="profile-confirm-password"
                    className="mb-2 block text-sm font-semibold"
                  >
                    Confirm new password
                    <FieldRequirement required={true} />
                  </label>
                  <PasswordInput
                    id="profile-confirm-password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
              </div>
              {passwordMessage && (
                <div className="mt-5">
                  <InlineNotice
                    tone={passwordMessage.error ? "error" : "success"}
                  >
                    {passwordMessage.text}
                  </InlineNotice>
                </div>
              )}
              <button
                type="submit"
                className="btn-secondary mt-6 w-full"
                disabled={changing}
              >
                {changing ? "Confirming…" : "Change password"}
              </button>
              <Link href="/forgot-password" className="text-link mt-2">
                Forgot your current password?
              </Link>
            </form>
            <section className="rounded-3xl border border-border bg-bg-card p-6">
              <h2 className="section-title">Your information, your choices</h2>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                Request access, correction, or account deletion through Help.
                The café reviews requests and explains any records it must
                retain.
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5">
                <Link href="/help?type=privacy" className="text-link">
                  Make a privacy request
                </Link>
                <Link href="/privacy" className="text-link">
                  Privacy notice
                </Link>
              </div>
              <a href="tel:+639260159202" className="text-link">
                Privacy contact: +63 926 015 9202
              </a>
            </section>
          </div>
        </div>
      )}
    </AppShell>
  );
}
