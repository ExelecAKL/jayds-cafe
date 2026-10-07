// packages/shared/src/hooks/useAuth.tsx
// AuthContext + AuthProvider + useAuth() hook

"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
  useRef,
} from "react";
import { supabase } from "../supabase/client";
import { appPath } from "../utils/app-path";
import type { Profile, UserRole } from "../types/index";
import type { User, Session } from "@supabase/supabase-js";

// ── State & Actions ─────────────────────────────────────────

interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
}

type AuthAction =
  | {
      type: "SET_SESSION";
      payload: { session: Session | null; user: User | null };
    }
  | { type: "SET_PROFILE"; payload: Profile | null }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_INITIALIZED" }
  | { type: "SIGN_OUT" };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "SET_SESSION":
      return {
        ...state,
        session: action.payload.session,
        user: action.payload.user,
        profile:
          state.profile?.id === action.payload.user?.id ? state.profile : null,
      };
    case "SET_PROFILE":
      return { ...state, profile: action.payload };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_INITIALIZED":
      return { ...state, initialized: true, loading: false };
    case "SIGN_OUT":
      return {
        ...state,
        user: null,
        profile: null,
        session: null,
        loading: false,
      };
    default:
      return state;
  }
}

const initialState: AuthState = {
  user: null,
  profile: null,
  session: null,
  loading: true,
  initialized: false,
};

// ── Context ─────────────────────────────────────────────────

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    phone?: string,
    role?: UserRole,
    legalVersion?: string,
  ) => Promise<{ error: Error | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  isCustomer: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  isStaffOrAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ── Provider ────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const profileOwner = useRef<string | null>(null);

  // Fetch profile from Supabase
  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error fetching profile:", error);
      return null;
    }

    if (profileOwner.current !== userId) return null;
    dispatch({ type: "SET_PROFILE", payload: data as Profile });
    return data as Profile;
  }, []);

  const resolveAuthenticatedUser = useCallback(
    async (session: Session | null) => {
      if (!session || !session.user) {
        profileOwner.current = null;
        dispatch({
          type: "SET_SESSION",
          payload: { session: null, user: null },
        });
        dispatch({ type: "SET_PROFILE", payload: null });
        return null;
      }

      profileOwner.current = session.user.id;
      dispatch({
        type: "SET_SESSION",
        payload: { session, user: session.user },
      });
      void fetchProfile(session.user.id);
      return session.user;
    },
    [fetchProfile],
  );

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        await resolveAuthenticatedUser(session);
      } catch (err) {
        console.error("Auth initialization error:", err);
      } finally {
        dispatch({ type: "SET_INITIALIZED" });
      }
    };

    initAuth();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // Avoid awaiting another Supabase call inside the auth callback.
      void resolveAuthenticatedUser(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [resolveAuthenticatedUser]);

  useEffect(() => {
    const refreshOwnedProfile = (event: Event) => {
      const userId = (event as CustomEvent<{ userId?: string }>).detail?.userId;
      if (userId && profileOwner.current === userId) void fetchProfile(userId);
    };
    window.addEventListener("jayds-profile-updated", refreshOwnedProfile);
    return () =>
      window.removeEventListener("jayds-profile-updated", refreshOwnedProfile);
  }, [fetchProfile]);

  // ── Auth Methods ────────────────────────────────────────

  const signIn = useCallback(
    async (email: string, password: string) => {
      dispatch({ type: "SET_LOADING", payload: true });
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (!error && data.session && data.user) {
          profileOwner.current = data.user.id;
          dispatch({
            type: "SET_SESSION",
            payload: { session: data.session, user: data.user },
          });
          void fetchProfile(data.user.id);
        }

        return { error: error ? new Error(error.message) : null };
      } finally {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    },
    [fetchProfile],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      phone?: string,
      role: UserRole = "customer",
      legalVersion?: string,
    ) => {
      dispatch({ type: "SET_LOADING", payload: true });
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone: phone || null,
            role,
            ...(role === "customer" && legalVersion
              ? { jayds_legal_version: legalVersion }
              : {}),
          },
        },
      });
      dispatch({ type: "SET_LOADING", payload: false });
      return {
        error: error ? new Error(error.message) : null,
        needsEmailConfirmation: !data.session,
      };
    },
    [],
  );

  const signOut = useCallback(async () => {
    if (
      process.env.NEXT_PUBLIC_APP_SCOPE === "customer" &&
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const { data } = await supabase.auth.getSession();
          await fetch("/api/customer/push", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              ...(data.session
                ? { Authorization: `Bearer ${data.session.access_token}` }
                : {}),
            },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
            signal: AbortSignal.timeout(5000),
          });
          await subscription.unsubscribe();
        }
      } catch {
        /* Logout remains available if push service is unavailable. */
      }
    }
    const { error } = await supabase.auth.signOut();
    if (error)
      throw new Error("Sign out could not complete. Please try again.");
    profileOwner.current = null;
    dispatch({ type: "SIGN_OUT" });
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email,
      typeof window !== "undefined"
        ? { redirectTo: window.location.origin + appPath("/reset-password") }
        : undefined,
    );
    return { error: error ? new Error(error.message) : null };
  }, []);

  // ── Role Helpers ──────────────────────────────────────────

  const role = state.profile?.role;
  const isCustomer = role === "customer";
  const isStaff = role === "staff";
  const isAdmin = role === "admin";
  const isStaffOrAdmin = isStaff || isAdmin;

  const value: AuthContextValue = {
    ...state,
    signIn,
    signUp,
    signOut,
    resetPassword,
    isCustomer,
    isStaff,
    isAdmin,
    isStaffOrAdmin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
