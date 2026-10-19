import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const target = "apps/admin/components/Overview.tsx";
const source = [
  "apps/admin/app",
  "apps/admin/components",
  "apps/admin/design-system",
];
const tokens = "apps/admin/design-system/tokens.json";
const adapter = ["--import", "./tests/admin-dashboard-fixture.mjs"];
const nodeGate = (name, ...args) => [
  process.execPath,
  ...adapter,
  `output/scripts/${name}.mjs`,
  target,
  ...args,
];
const checks = [
  ["tokens", ["python", "output/scripts/validate_tokens.py", tokens]],
  ["contrast", ["python", "output/scripts/validate_contrast.py", tokens]],
  ["hardcodes", ["python", "output/scripts/lint_hardcodes.py", ...source]],
  ["emoji", ["python", "output/scripts/check_no_emoji.py", ...source]],
  [
    "native-select",
    ["python", "output/scripts/lint_native_select.py", ...source],
  ],
  ["states-light", nodeGate("verify_states")],
  ["states-dark", nodeGate("verify_states", "--dark")],
  ["axe-light", nodeGate("axe_audit")],
  ["axe-dark", nodeGate("axe_audit", "--dark")],
  ["responsive", nodeGate("verify_responsive", "--scale=1.25")],
  ["keyboard", nodeGate("verify_keyboard")],
  ["targets", nodeGate("verify_target_size")],
  ["mobile-first", nodeGate("verify_mobile_first", "--scale=1.25")],
  ["intent", nodeGate("lint_intent")],
  ["taste", nodeGate("slop_tells", "--strict")],
  ["overflow", nodeGate("verify_overflow")],
  ["motion", nodeGate("verify_reduced_motion")],
];
const requested = process.argv.slice(2);
const queue = checks.filter(
  ([name]) => !requested.length || requested.includes(name),
);
if (!queue.length) throw new Error("No matching UI checks");
const reportPath = ".codex-logs/dashboard/gates.json";
const results = requested.length && existsSync(reportPath)
  ? JSON.parse(readFileSync(reportPath, "utf8"))
  : [];
mkdirSync(".codex-logs/dashboard", { recursive: true });
async function worker() {
  while (queue.length) {
    const [name, [command, ...args]] = queue.shift();
    const result = await new Promise((resolve) => {
      let output = "";
      const child = spawn(command, args, {
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
          DS_REQUIRE_BROWSER: "1",
          JAYDS_DESIGN_GATES: "1",
          JAYDS_DASHBOARD_URL:
            process.env.JAYDS_DASHBOARD_URL || "http://127.0.0.1:4282",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
      child.stderr.on("data", (chunk) => {
        output += chunk;
      });
      child.on("error", (error) =>
        resolve({ name, code: 2, output: String(error) }),
      );
      child.on("exit", (code) => resolve({ name, code, output }));
    });
    const previous = results.findIndex(item => item.name === result.name);
    if (previous >= 0) results[previous] = result;
    else results.push(result);
    writeFileSync(
      reportPath,
      JSON.stringify(results, null, 2),
    );
    console.log(
      `${result.code === 0 && !/SKIPPED/.test(result.output) ? "PASS" : "FAIL"} ${name}\n${result.output.trim()}\n`,
    );
  }
}
await Promise.all([worker(), worker(), worker()]);
process.exitCode = results.some((r) => r.code !== 0 || /SKIPPED/.test(r.output))
  ? 1
  : 0;
