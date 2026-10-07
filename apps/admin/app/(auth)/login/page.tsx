// apps/admin/app/(auth)/login/page.tsx
// Admin login page

"use client";

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
  const { signIn, signOut, user, profile, initialized, isAdmin } = useAuth();
  const resolvedRole =
    profile?.role ??
    (typeof user?.user_metadata?.role === "string"
      ? user.user_metadata.role
      : null);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    if (user && resolvedRole) {
      if (isAdmin || resolvedRole === "admin") {
        router.replace("/dashboard");
        return;
      }

      if (resolvedRole !== "admin") {
        void signOut().then(
          () => setError("This account does not have Administrator access."),
          () => setError("Sign out could not complete. Please try again."),
        );
      }
      return;
    }
  }, [initialized, isAdmin, resolvedRole, router, signOut, user]);

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
    <div className="min-h-screen flex items-center justify-center bg-[#2d211c] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <BrandArtwork
            variant="lockup"
            tone="cream"
            className="block w-64 max-w-full h-auto mx-auto mb-4"
            preload
          />
          <h1 className="sr-only">Jayds Café administrator login</h1>
          <p className="text-gray-400 mt-1">The café operations center</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-2xl p-6 space-y-4"
        >
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 border border-red-100">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
              placeholder="Your administrator email"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-[#98633f] text-white font-semibold rounded-xl shadow-lg shadow-amber-200 hover:shadow-amber-300 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
