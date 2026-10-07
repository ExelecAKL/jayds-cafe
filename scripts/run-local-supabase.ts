import { spawn, spawnSync, type StdioOptions } from 'node:child_process';
import process from 'node:process';

const mode = process.argv[2] ?? 'dev';
const allowedModes = new Set(['dev', 'build:start']);

if (!allowedModes.has(mode)) {
  console.error('Usage: npx tsx scripts/run-local-supabase.ts <dev|build:start>');
  process.exit(1);
}

function runSupabase(args: string[]) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'supabase';
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'supabase', ...args]
    : args;

  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  if (result.error) {
    console.error('Supabase CLI was not found. Install it first, then retry.');
    console.error('See docs/local-supabase.md for setup steps.');
    process.exit(1);
  }

  if (result.status !== 0) {
    if (result.stdout) {
      console.error(result.stdout.trim());
    }
    if (result.stderr) {
      console.error(result.stderr.trim());
    }
    process.exit(result.status ?? 1);
  }

  return result.stdout;
}

function parseEnv(output: string) {
  const parsed: Record<string, string> = {};

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    parsed[key] = rawValue.replace(/^["']|["']$/g, '');
  }

  return parsed;
}

function runNpmScript(scriptName: string, env: NodeJS.ProcessEnv, stdio: StdioOptions = 'inherit') {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm', 'run', scriptName]
    : ['run', scriptName];

  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    shell: false,
    stdio,
  });

  if (result.error) {
    console.error(`Failed to run \`npm run ${scriptName}\`: ${result.error.message}`);
    process.exit(1);
  }

  return result;
}

function spawnNpmScript(scriptName: string, env: NodeJS.ProcessEnv) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm', 'run', scriptName]
    : ['run', scriptName];

  return spawn(command, args, {
    cwd: process.cwd(),
    env,
    shell: false,
    stdio: 'inherit',
  });
}

const localStatus = parseEnv(runSupabase(['status', '-o', 'env']));

const localUrl =
  localStatus.API_URL ??
  localStatus.SUPABASE_API_URL ??
  localStatus.SUPABASE_URL ??
  'http://127.0.0.1:54321';

const anonKey =
  localStatus.ANON_KEY ??
  localStatus.SUPABASE_ANON_KEY ??
  localStatus.PUBLISHABLE_KEY ??
  localStatus.SUPABASE_PUBLISHABLE_KEY;

const serviceRoleKey =
  localStatus.SERVICE_ROLE_KEY ??
  localStatus.SUPABASE_SERVICE_ROLE_KEY ??
  localStatus.SECRET_KEY ??
  localStatus.SUPABASE_SECRET_KEY;

if (!anonKey || !serviceRoleKey) {
  console.error('Local Supabase is running, but the CLI did not return the expected auth keys.');
  console.error('Run `npm run db:env` and check for ANON_KEY and SERVICE_ROLE_KEY.');
  process.exit(1);
}

const localEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: localUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
};

console.log(`Using local Supabase for this ${mode} process only: ${localUrl}`);
console.log('Your app .env.local files remain unchanged.');

if (mode === 'dev') {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/run-workspaces.ts', 'dev'], {
    cwd: process.cwd(),
    env: localEnv,
    shell: false,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
} else {
  console.log('Running local Supabase build: npm run build');
  const build = runNpmScript('build', localEnv);

  if (build.status !== 0) {
    console.error(`Local Supabase build failed with exit code ${build.status ?? 'unknown'}.`);
    process.exit(build.status ?? 1);
  }

  console.log('Build complete. Starting apps with local Supabase env: npm run start');
  const child = spawnNpmScript('start', localEnv);
  child.on('error', (error) => {
    console.error(`Failed to run \`npm run start\`: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}
