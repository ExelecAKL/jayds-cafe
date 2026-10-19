import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const output = "tmp/customer-enhancement";
mkdirSync(output, { recursive: true });
const selected = process.argv.slice(2);
const gates = [
  "axe_audit",
  "verify_states",
  "verify_responsive",
  "verify_keyboard",
  "verify_target_size",
  "verify_mobile_first",
  "verify_interactive",
  "verify_overflow",
  "verify_reduced_motion",
  "verify_screen_economy",
  "slop_tells",
];
const jobs = ["/menu", "/menu/browse"].flatMap((route) =>
  gates
    .filter((gate) => !selected.length || selected.includes(gate))
    .map((gate) => ({ route, gate })),
);
const results = [];
async function worker() {
  while (jobs.length) {
    const { route, gate } = jobs.shift();
    const target = route.endsWith("browse")
      ? "apps/customer/app/(shop)/menu/browse/page.tsx"
      : "apps/customer/app/(shop)/menu/page.tsx";
    const args = [
      "--import",
      "./tests/customer-enhancement-fixture.mjs",
      `output/scripts/${gate}.mjs`,
      target,
    ];
    if (gate === "verify_responsive") args.push("--scale=1.25");
    if (gate === "slop_tells") args.push("--strict");
    const result = await new Promise((resolve) => {
      let output = "";
      const child = spawn(process.execPath, args, {
        windowsHide: true,
        env: {
          ...process.env,
          DS_REQUIRE_BROWSER: "1",
          JAYDS_CUSTOMER_DESIGN_GATES: "1",
          JAYDS_CUSTOMER_GATE_ROUTE: route,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (data) => {
        output += data;
      });
      child.stderr.on("data", (data) => {
        output += data;
      });
      child.on("error", (error) =>
        resolve({ route, gate, code: 2, output: String(error) }),
      );
      child.on("exit", (code) => resolve({ route, gate, code, output }));
    });
    results.push(result);
    writeFileSync(
      `${output}/gates${selected.length ? `-${selected.join("-")}` : ""}.json`,
      JSON.stringify(results, null, 2),
    );
    console.log(
      `${result.code === 0 && !/SKIPPED/.test(result.output) ? "PASS" : "FAIL"} ${route} ${gate}\n${result.output.trim()}\n`,
    );
  }
}
await worker();
process.exitCode = results.some((r) => r.code !== 0 || /SKIPPED/.test(r.output))
  ? 1
  : 0;
