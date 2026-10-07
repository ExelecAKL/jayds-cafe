import { spawn, type ChildProcess } from 'node:child_process';
import type { Readable } from 'node:stream';
import process from 'node:process';
import readline from 'node:readline';

const command = process.argv[2];

if (!command || !['dev', 'start'].includes(command)) {
  console.error('Usage: npx tsx scripts/run-workspaces.ts <dev|start>');
  process.exit(1);
}

const workspaces = [
  { name: 'customer', path: 'apps/customer' },
  { name: 'pos', path: 'apps/pos' },
  { name: 'admin', path: 'apps/admin' },
];

const children: ChildProcess[] = [];
let shuttingDown = false;

function getSpawnTarget(workspacePath: string) {
  if (process.platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm', 'run', command, '-w', workspacePath],
    };
  }

  return {
    command: 'npm',
    args: ['run', command, '-w', workspacePath],
  };
}

function prefixStream(stream: Readable | null | undefined, label: string) {
  if (!stream) {
    return;
  }

  const rl = readline.createInterface({ input: stream });
  rl.on('line', (line) => {
    console.log(`[${label}] ${line}`);
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      if (process.platform === 'win32') {
        child.kill();
      } else {
        child.kill('SIGTERM');
      }
    }
  }

  process.exit(exitCode);
}

for (const workspace of workspaces) {
  const target = getSpawnTarget(workspace.path);
  const child = spawn(
    target.command,
    target.args,
    {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: ['inherit', 'pipe', 'pipe'],
    }
  );

  prefixStream(child.stdout, workspace.name);
  prefixStream(child.stderr, workspace.name);

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    if (signal) {
      console.error(`[${workspace.name}] exited with signal ${signal}`);
      shutdown(1);
      return;
    }

    if (typeof code === 'number' && code !== 0) {
      console.error(`[${workspace.name}] exited with code ${code}`);
      shutdown(code);
    }
  });

  children.push(child);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
