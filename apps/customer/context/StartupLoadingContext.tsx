"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { useMenu } from "@cafeos/shared/hooks/useMenu";

type StartupPhase = "logo" | "welcome" | "leaving" | "hidden";
const StartupLoadingContext = createContext({
  logoPhaseDone: false,
  bannerPhaseDone: false,
  isFadingOut: false,
  isOverlayVisible: true,
  startupTimedOut: false,
});
export function StartupLoadingProvider({ children }: { children: ReactNode }) {
  const { initialized } = useAuth();
  const { loading: catalogLoading } = useMenu();
  const [phase, setPhase] = useState<StartupPhase>("logo");
  const [startupTimedOut, setStartupTimedOut] = useState(false);
  const ready = initialized && !catalogLoading;
  useEffect(() => {
    const logoTimer = setTimeout(() => setPhase("welcome"), 2500);
    return () => clearTimeout(logoTimer);
  }, []);
  useEffect(() => {
    if (phase !== "welcome" || !ready) return;
    const timer = setTimeout(() => setPhase("leaving"), 250);
    return () => clearTimeout(timer);
  }, [phase, ready]);
  useEffect(() => {
    if (phase !== "welcome" || ready) return;
    const timer = setTimeout(() => setStartupTimedOut(true), 12000);
    return () => clearTimeout(timer);
  }, [phase, ready]);
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
        startupTimedOut,
      }}
    >
      {children}
    </StartupLoadingContext.Provider>
  );
}
export function useStartupLoading() {
  return useContext(StartupLoadingContext);
}
