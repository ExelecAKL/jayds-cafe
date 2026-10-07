// Run after npm run build. HTTP only: no browser, DOM, login, or live order writes.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const next = path.join(root, "node_modules/next/dist/bin/next");
const children: ChildProcess[] = [];
const existingDemoServers = process.env.JAYDS_DEMO_EXISTING_PORTS === "1";
let checks = 0;

async function probe(
  base: string,
  route: string,
  status: number | number[],
  init?: RequestInit,
) {
  const response = await fetch(base + route, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  const expected = Array.isArray(status) ? status : [status];
  assert.ok(
    expected.includes(response.status),
    `${base}${route}: expected ${expected}, got ${response.status}`,
  );
  await response.arrayBuffer();
  console.log(`${init?.method ?? "GET"} ${base}${route}: ${response.status}`);
  checks++;
  return response;
}

async function start(name: string, port: number) {
  const cwd = path.join(root, "apps", name);
  const manifest = JSON.parse(
    readFileSync(path.join(cwd, ".next/routes-manifest.json"), "utf8"),
  ) as { basePath: string };
  const host = existingDemoServers
    ? process.env.JAYDS_DEMO_HOST || "127.0.0.1"
    : "127.0.0.1";
  const base = `http://${host}:${port}${manifest.basePath}`;
  if (existingDemoServers) {
    assert.equal(
      (await fetch(base + "/login")).status,
      200,
      `${name} demo server is ready`,
    );
    return base;
  }
  const child = spawn(
    process.execPath,
    [next, "start", "-p", String(port), "-H", "127.0.0.1"],
    {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "production" },
    },
  );
  children.push(child);
  let startupError: Error | undefined;
  child.on("error", (error) => {
    startupError = error;
  });
  // Consume output without exposing environment details or response bodies.
  child.stdout?.resume();
  child.stderr?.resume();
  for (let attempt = 0; attempt < 100; attempt++) {
    if (startupError) throw startupError;
    assert.equal(
      child.exitCode,
      null,
      `${name} server exited before becoming ready`,
    );
    try {
      const response = await fetch(base + "/login", {
        signal: AbortSignal.timeout(1_000),
      });
      await response.arrayBuffer();
      if (response.ok) return base;
    } catch {
      /* Wait for this process to bind its port. */
    }
    await delay(200);
  }
  throw new Error(`${name} server did not become ready`);
}

try {
  const customer = await start("customer", existingDemoServers ? 4000 : 4140);
  const pos = await start("pos", existingDemoServers ? 4001 : 4141);
  const admin = await start("admin", existingDemoServers ? 4002 : 4142);
  for (const route of [
    "/menu",
    "/menu/browse",
    "/cart",
    "/checkout",
    "/checkout/confirm",
    "/login",
    "/orders",
    "/account",
    "/rewards",
    "/vouchers",
    "/favorites",
    "/help",
    "/notifications",
    "/terms",
    "/privacy",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/manifest.json",
    "/sw.js",
  ]) {
    await probe(customer, route, 200);
  }
  const legacy = await probe(
    customer,
    "/menu/11111111-1111-4111-8111-111111111111",
    [307, 308],
  );
  assert.ok(
    legacy.headers
      .get("location")
      ?.includes("/menu/browse/11111111-1111-4111-8111-111111111111"),
  );
  const emptyPost: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  };
  await probe(customer, "/api/orders/create", 400, emptyPost);
  await probe(customer, "/api/maya/webhook", 400, emptyPost);
  await probe(customer, "/api/maya/verify", 400, emptyPost);
  for (const route of ["/api/customer/favorites", "/api/customer/legal"])
    await probe(customer, route, 401);
  await probe(customer, "/api/jobs/customer-notifications", 401, emptyPost);
  await probe(customer, "/api/location?q=x", 400);
  const branch = await fetch(customer + "/api/branch");
  assert.equal(branch.status, 200);
  const branchData = await branch.json();
  assert.ok(
    !JSON.stringify(branchData).includes("void_pin"),
    "Public branch cannot expose private security settings",
  );
  checks++;
  for (const route of ["/login", "/dashboard", "/new-order", "/kds"])
    await probe(pos, route, 200);
  await probe(pos, "/api/orders/create", 401, emptyPost);
  for (const route of [
    "/api/orders/checkout",
    "/api/orders/action",
    "/api/orders/pickup",
    "/api/account/lookup",
  ])
    await probe(pos, route, 401, emptyPost);
  await probe(pos, "/api/orders/queue", 401, emptyPost);
  await probe(admin, "/api/customer-care/reconcile", 401, emptyPost);
  for (const route of [
    "/login",
    "/dashboard",
    "/menu",
    "/orders",
    "/staff",
    "/inventory",
    "/inventory?tab=forecasts",
    "/purchasing",
    "/audit",
    "/scheduling",
    "/customer-care",
  ])
    await probe(admin, route, 200);
  console.log(`Passed ${checks} HTTP checks. No browser or DOM access used.`);
} finally {
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
  await Promise.all(
    children.map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            child.once("exit", () => resolve());
            setTimeout(resolve, 3_000).unref();
          }),
    ),
  );
}
