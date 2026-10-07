import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface DemoUser { email: string; password: string; fullName: string; role: 'admin' | 'staff'; }

const DEMO_USERS: DemoUser[] = [
  {
    email: 'admin@cafeos.ph',
    password: process.env.LOCAL_ADMIN_PASSWORD ?? 'JaydsAdmin123!',
    fullName: 'CafeOS Admin',
    role: 'admin',
  },
  {
    email: 'staff@cafeos.ph',
    password: process.env.LOCAL_STAFF_PASSWORD ?? 'JaydsStaff123!',
    fullName: 'CafeOS Staff',
    role: 'staff',
  },
];

function runSupabaseStatusEnv() {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'supabase';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'supabase', 'status', '-o', 'env']
    : ['status', '-o', 'env'];

  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  if (result.error) {
    console.error('Supabase CLI was not found. Run `npm install` first.');
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

async function findUserByEmail(supabase: SupabaseClient, email: string) {
  let page = 1;

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) {
      throw error;
    }

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (user) {
      return user;
    }

    if (data.users.length < 100) {
      return null;
    }

    page += 1;
  }

  return null;
}

async function upsertDemoUser(supabase: SupabaseClient, demoUser: DemoUser) {
  const metadata = {
    full_name: demoUser.fullName,
    role: demoUser.role,
  };

  let user = await findUserByEmail(supabase, demoUser.email);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: demoUser.email,
      password: demoUser.password,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (error) {
      throw error;
    }

    user = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      password: demoUser.password,
      user_metadata: metadata,
    });

    if (error) {
      throw error;
    }

    user = data.user;
  }

  if (!user) throw new Error('Auth service did not return the created user');

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: demoUser.email,
        full_name: demoUser.fullName,
        role: demoUser.role,
      },
      { onConflict: 'id' }
    );

  if (profileError) {
    throw profileError;
  }

  console.log(`Seeded ${demoUser.role}: ${demoUser.email}`);
}

const localStatus = parseEnv(runSupabaseStatusEnv());
const apiUrl = localStatus.API_URL ?? localStatus.SUPABASE_URL;
const serviceRoleKey = localStatus.SERVICE_ROLE_KEY ?? localStatus.SUPABASE_SERVICE_ROLE_KEY;

if (!apiUrl || !serviceRoleKey) {
  console.error('Could not read local API_URL and SERVICE_ROLE_KEY from `supabase status -o env`.');
  process.exit(1);
}

const hostname = new URL(apiUrl).hostname;
if (!['127.0.0.1', 'localhost'].includes(hostname)) {
  console.error(`Refusing to seed auth users into a non-local Supabase URL: ${apiUrl}`);
  process.exit(1);
}

const supabase = createClient(apiUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

try {
  for (const demoUser of DEMO_USERS) {
    await upsertDemoUser(supabase, demoUser);
  }

  console.log('Local demo auth users are ready.');
  console.log('Default admin password: JaydsAdmin123!');
  console.log('Default staff password: JaydsStaff123!');
} catch (error) {
  console.error('Failed to seed local demo auth users:');
  console.error(error);
  process.exit(1);
}
