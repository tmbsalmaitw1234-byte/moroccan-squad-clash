import type { Backend } from './backend';
import { DemoServer } from './server';
import { SupabaseServer } from './supabase';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Supabase when configured in .env, otherwise the in-browser demo. */
export const server: Backend = url && key ? new SupabaseServer(url, key) : new DemoServer();
