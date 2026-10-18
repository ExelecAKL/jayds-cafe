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
import { normalizeContactPhone, isValidContactPhone } from "../customer/phone";
import { appPath } from "../utils/app-path";
import type { Profile, UserRole } from "../types/index";
import type { User, Session } from "@supabase/supabase-js";
import { withRequestDeadline } from "../utils/request";

// ── State & Actions ─────────────────────────────────────────

interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  profileLoading: boolean;
  profileError: string | null;
  sessionError: string | null;
}

type AuthAction =
  | {
      type: "SET_SESSION";
      payload: { session: Session | null; user: User | null };
    }
  | { type: "SET_PROFILE"; payload: Profile | null }
  | { type: "PROFILE_LOADING" }
  | { type: "PROFILE_ERROR"; payload: string }
  | { type: "SESSION_ERROR"; payload: string }
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
        sessionError: null,
        profile:
          state.profile?.id === action.payload.user?.id ? state.profile : null,
      };
    case "SET_PROFILE":
      return {
        ...state,
        profile: action.payload,
        profileLoading: false,
        profileError: null,
      };
    case "PROFILE_LOADING":
      return { ...state, profileLoading: true, profileError: null };
    case "PROFILE_ERROR":
      return { ...state, profileLoading: false, profileError: action.payload };
    case "SESSION_ERROR":
      return { ...state, sessionError: action.payload };
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
        profileLoading: false,
        profileError: null,
        sessionError: null,
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
  profileLoading: false,
  profileError: null,
  sessionError: null,
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
  refreshProfile: () => Promise<void>;
  isCustomer: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  isStaffOrAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function accountError(
  error: { message: string; code?: string; status?: number } | null,
) {
  return error
    ? Object.assign(new Error(error.message), {
        code: error.code,
        status: error.status,
      })
    : null;
}

// ── Provider ────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const profileOwner = useRef<string | null>(null);
  const profileVersion = useRef(0);
  const profileTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Fetch profile from Supabase
  const fetchProfile = useCallback(async (userId: string) => {
    const version = ++profileVersion.current;
    dispatch({ type: "PROFILE_LOADING" });
    try {
      const { data, error } = await withRequestDeadline((signal) =>
        supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .abortSignal(signal)
          .single(),
      );

      if (error) {
        throw new Error("Account details could not load. Please try again.");
      }

      if (profileOwner.current !== userId || profileVersion.current !== version)
        return null;
      dispatch({ type: "SET_PROFILE", payload: data as Profile });
      return data as Profile;
    } catch (failure) {
      if (profileOwner.current === userId && profileVersion.current === version)
        dispatch({
          type: "PROFILE_ERROR",
          payload:
            failure instanceof Error
              ? failure.message
              : "Account details could not load. Please try again.",
        });
      return null;
    }
  }, []);

  const resolveAuthenticatedUser = useCallback(
    async (session: Session | null) => {
      if (!session || !session.user) {
        ++profileVersion.current;
        clearTimeout(profileTimer.current);
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
      // Run data reads after the SDK's auth-event callback has returned.
      clearTimeout(profileTimer.current);
      profileTimer.current = setTimeout(
        () => void fetchProfile(session.user.id),
        0,
      );
      return session.user;
    },
    [fetchProfile],
  );

  // Initialize auth state
  useEffect(() => {
    let active = true;
    const initAuth = async () => {
      try {
        const { data, error } = await withRequestDeadline(() =>
          supabase.auth.getSession(),
        );
        if (error) throw error;
        if (!active) return;
        await resolveAuthenticatedUser(data.session);
      } catch (err) {
        if (active)
          dispatch({
            type: "SESSION_ERROR",
            payload:
              err instanceof Error
                ? err.message
                : "Your session could not load. Please try again.",
          });
      } finally {
        if (active) dispatch({ type: "SET_INITIALIZED" });
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
      active = false;
      subscription.unsubscribe();
      clearTimeout(profileTimer.current);
      ++profileVersion.current;
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

  const refreshProfile = useCallback(async () => {
    dispatch({ type: "PROFILE_LOADING" });
    try {
      const { data, error } = await withRequestDeadline(() =>
        supabase.auth.getSession(),
      );
      if (error) throw error;
      await resolveAuthenticatedUser(data.session);
      if (!data.session) dispatch({ type: "SET_PROFILE", payload: null });
    } catch {
      dispatch({
        type: "PROFILE_ERROR",
        payload: "Your session could not be checked. Try again or sign out.",
      });
    }
  }, [resolveAuthenticatedUser]);

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
          clearTimeout(profileTimer.current);
          void fetchProfile(data.user.id);
        }

        return { error: accountError(error) };
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
      const contactPhone =
        role === "customer" ? normalizeContactPhone(phone ?? "") : phone;
      if (role === "customer" && !isValidContactPhone(contactPhone ?? "")) {
        return {
          error: new Error(
            "A valid phone number is required for customer registration.",
          ),
          needsEmailConfirmation: false,
        };
      }
      dispatch({ type: "SET_LOADING", payload: true });
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            ...(typeof window !== "undefined"
              ? { emailRedirectTo: window.location.origin + appPath("/login") }
              : {}),
            data: {
              full_name: fullName,
              phone: contactPhone || null,
              role,
              ...(role === "customer" && legalVersion
                ? { jayds_legal_version: legalVersion }
                : {}),
            },
          },
        });
        return {
          error: accountError(error),
          needsEmailConfirmation: !data.session,
        };
      } catch {
        return {
          error: new Error(
            "Account creation could not connect. Please try again; your entries are saved.",
          ),
          needsEmailConfirmation: false,
        };
      } finally {
        dispatch({ type: "SET_LOADING", payload: false });
      }
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
    return { error: accountError(error) };
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
    refreshProfile,
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
