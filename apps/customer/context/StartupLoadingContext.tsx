"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@cafeos/shared/hooks/useAuth";

type StartupPhase = "logo" | "welcome" | "leaving" | "hidden";
const StartupLoadingContext = createContext({
  logoPhaseDone: false,
  bannerPhaseDone: false,
  isFadingOut: false,
  isOverlayVisible: true,
  markStartupReady: () => undefined as void,
});
export function StartupLoadingProvider({ children }: { children: ReactNode }) {
  const { initialized } = useAuth();
  const [phase, setPhase] = useState<StartupPhase>("logo");
  const [ready, setReady] = useState(false);
  const [fallbackReady, setFallbackReady] = useState(false);
  const markStartupReady = useCallback(() => setReady(true), []);
  useEffect(() => {
    const firstFrame = requestAnimationFrame(markStartupReady);
    const logoTimer = setTimeout(() => setPhase("welcome"), 350);
    // A failed session/network check must never leave the app behind a splash.
    const fallback = setTimeout(() => setFallbackReady(true), 4000);
    return () => {
      cancelAnimationFrame(firstFrame);
      clearTimeout(logoTimer);
      clearTimeout(fallback);
    };
  }, [markStartupReady]);
  useEffect(() => {
    if (phase !== "welcome" || !((initialized && ready) || fallbackReady))
      return;
    const timer = setTimeout(() => setPhase("leaving"), 250);
    return () => clearTimeout(timer);
  }, [phase, initialized, ready, fallbackReady]);
  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = setTimeout(() => setPhase("hidden"), 220);
    return () => clearTimeout(timer);
  }, [phase]);
  return (
    <StartupLoadingContext.Provider
      value={{
        logoPhaseDone: phase !== "logo",
        bannerPhaseDone: phase === "leaving" || phase === "hidden",
        isFadingOut: phase === "leaving",
        isOverlayVisible: phase !== "hidden",
        markStartupReady,
      }}
    >
      {children}
    </StartupLoadingContext.Provider>
  );
}
export function useStartupLoading() {
  return useContext(StartupLoadingContext);
}
