import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sqlPath = process.argv[2];

if (!sqlPath) {
  console.error('Usage: npx tsx scripts/apply-local-sql.ts <path-to-sql-file>');
  process.exit(1);
}

const resolvedSqlPath = resolve(process.cwd(), sqlPath);
const sql = readFileSync(resolvedSqlPath, 'utf8');
const config = readFileSync(resolve(process.cwd(), 'supabase/config.toml'), 'utf8');
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1] ?? 'cafeos-local';
const containerName = `supabase_db_${projectId}`;

const child = spawn(
  'docker',
  ['exec', '-i', containerName, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
  {
    cwd: process.cwd(),
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: false,
  }
);

child.on('error', (error) => {
  console.error(`Failed to start Docker/psql: ${error.message}`);
  process.exit(1);
});

child.stdin.end(sql);

child.on('exit', (code) => {
  if (code === 0) {
    console.log(`Applied SQL file to local Supabase: ${sqlPath}`);
    return;
  }

  console.error(`Failed to apply SQL file to local Supabase: ${sqlPath}`);
  process.exit(code ?? 1);
});
