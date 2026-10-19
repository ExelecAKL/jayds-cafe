import type { Page } from "playwright";
export const base: string;
export const admin: Record<string, unknown>;
export const fixtureOrders: Record<string, unknown>[];
export function isolateDashboard(page: Page, state?: { empty?: boolean; fail?: boolean; ordersFail?: boolean; delay?: number; periods?: number[] }): Promise<void>;
