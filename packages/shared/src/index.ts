// packages/shared/src/index.ts
// Barrel export for @cafeos/shared

export * from './types/index';
export { supabase } from './supabase/client';
export { createAdminSupabaseClient, createAppServerClient } from './supabase/server';
export { MayaService } from './maya';
