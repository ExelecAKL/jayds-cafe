// Rehearsal against the running 4000/4001/4002 apps. Transaction fixtures remain
// isolated; this command neither creates provider bookings nor writes hosted sales.
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const root = process.cwd();
const host = process.env.JAYDS_DEMO_HOST || "127.0.0.1";
if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host))
  throw new Error("Use the laptop IPv4 address or 127.0.0.1.");
const env = {
  ...process.env,
  JAYDS_DEMO_EXISTING_PORTS: "1",
  JAYDS_DEMO_HOST: host,
};
for (const port of [4000, 4001, 4002]) {
  const response = await fetch(`http://${host}:${port}/login`, {
    signal: AbortSignal.timeout(5000),
  });
  await response.arrayBuffer();
  if (response.status !== 200)
    throw Error(`Start the production preview on port ${port} first.`);
}
const runs = [
  {
    name: "Backend transactions and security",
    args: [
      "--test",
      "--test-concurrency=2",
      ...readdirSync(path.join(root, "tests"))
        .filter((file) => file.endsWith(".test.ts"))
        .sort()
        .map((file) => path.join(root, "tests", file)),
    ],
  },
  { name: "HTTP pages and access guards", args: ["tests/http-smoke.ts"] },
  {
    name: "Customer ordering, voucher and rewards screens",
    args: ["tests/customer-browser.ts"],
  },
  {
    name: "Cashier and Admin operations",
    args: ["tests/browser-operations.ts"],
  },
];
const results: { name: string; passed: boolean; durationMs: number }[] = [];
mkdirSync(".codex-logs", { recursive: true });
for (const run of runs) {
  console.log("\n" + run.name);
  const started = Date.now();
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(root, "node_modules/tsx/dist/cli.mjs"), ...run.args],
      { cwd: root, env, stdio: "inherit", windowsHide: true },
    );
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  results.push({
    name: run.name,
    passed: code === 0,
    durationMs: Date.now() - started,
  });
  writeFileSync(
    ".codex-logs/demo-rehearsal.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        host,
        ports: [4000, 4001, 4002],
        hostedBusinessWrites: false,
        providerTransactions: false,
        results,
      },
      null,
      2,
    ),
  );
  if (code !== 0)
    throw Error(run.name + " failed; inspect the preceding diagnostic.");
}
console.log(
  "\nAll demo checks passed. Existing preview servers remain running.",
);
