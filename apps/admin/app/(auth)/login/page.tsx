// apps/admin/app/(auth)/login/page.tsx
// Admin login page

"use client";
import { PasswordInput } from "@cafeos/shared/ui/password-input";

import { FieldRequirement } from "@cafeos/shared/ui/field-requirement";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { BrandArtwork } from "@cafeos/shared/brand";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signOut, user, profile, initialized } = useAuth();
  const resolvedRole = profile?.id === user?.id ? profile?.role : null;

  useEffect(() => {
    if (!initialized) {
      return;
    }

    if (user && resolvedRole) {
      if (resolvedRole === "admin" && profile?.is_approved === true) {
        router.replace("/dashboard");
        return;
      }

      if (resolvedRole !== "admin" || profile?.is_approved !== true) {
        void signOut().then(
          () =>
            setError(
              "This account does not have approved Administrator access.",
            ),
          () => setError("Sign out could not complete. Please try again."),
        );
      }
      return;
    }
  }, [initialized, profile?.is_approved, resolvedRole, router, signOut, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError("");
    setIsLoading(true);

    try {
      const { error: signInError } = await signIn(email, password);
      if (signInError) setError(signInError.message);
    } catch {
      setError("We couldn't connect. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="admin-login">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <BrandArtwork
            variant="lockup"
            tone="cream"
            className="block w-64 max-w-full h-auto mx-auto mb-4"
            preload
          />
          <h1 className="sr-only">Jayds Café administrator login</h1>
          <p className="login-subtitle mt-1">The café operations center</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface rounded-2xl shadow-2xl p-6 space-y-4"
        >
          {error && (
            <div
              role="alert"
              className="bg-danger-soft text-danger text-sm rounded-xl p-3 border border-danger-border"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              Email
              <FieldRequirement required={true} />
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-subtle bg-raised text-ink placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-warning-border transition-all"
              placeholder="Your administrator email"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-ink mb-1.5"
            >
              Password
              <FieldRequirement required={true} />
            </label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-subtle bg-raised text-ink placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-warning-border transition-all"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-action text-on-action font-semibold rounded-xl shadow-lg shadow-none hover:shadow-none hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
