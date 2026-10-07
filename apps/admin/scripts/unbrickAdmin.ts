import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  if (line.trim() && !line.startsWith('#')) {
    const [key, ...vals] = line.split('=');
    env[key.trim()] = vals.join('=').trim().replace(/['"]/g, '');
  }
});

// Create Postgres connection string from URL and Key
const urlObj = new URL(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL);
// supabase co gives password in the dashboard.
// Since we don't have the raw DB URL, we MUST use REST API (supabase-js) or wait.
