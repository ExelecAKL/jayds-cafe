import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

const root = process.cwd(), output = path.resolve(process.env.JAYDS_AUDIT_OUTPUT_DIR || "output/system-audit-2026-10-12");
const postFix = output.includes("defense-fixes-2026-10-13");
mkdirSync(output, { recursive: true });
const read = (file: string) => JSON.parse(readFileSync(path.join(output, file), "utf8"));
const unitLog = readFileSync(path.join(output, postFix ? "unit-tests-final.log" : "unit-tests-expanded.log"), "utf8");
const unitResults = new Map<string, { name: string; status: string; scope: string }>();
for (const line of unitLog.split(/\r?\n/).filter(line => /^[✔✖] .+\([\d.]+ms\)$/.test(line))) {
  const name = line.replace(/^[✔✖] /, "").replace(/ \([\d.]+ms\)$/, "");
  unitResults.set(name, { name, status: line.startsWith("✔") ? "PASS" : "FAIL", scope: "isolated backend/migrations" });
}
const units = [...unitResults.values()];
function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
const routes = ["customer", "pos", "admin"].flatMap(app => {
  const dir = path.join(root, "apps", app, "app");
  return walk(dir).filter(file => /(?:page\.tsx|route\.ts)$/.test(file)).map(file => {
    const source = readFileSync(file, "utf8");
    const relative = path.relative(dir, path.dirname(file)).split(path.sep).filter(part => part && !part.startsWith("("));
    const kind = file.endsWith("page.tsx") ? "page" : "api";
    const methods = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)/g)].map(match => match[1]);
    if (!methods.length && kind === "api") for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) if (new RegExp("export[\\s\\S]*\\b" + method + "\\b[\\s\\S]*from").test(source)) methods.push(method);
    return { app, kind, route: "/" + relative.join("/"), source: path.relative(root, file).replaceAll(path.sep, "/"), methods };
  });
});
const groups = [
  { name: "Hosted public/API/role checks", scope: "live public reads and isolated role identities", data: read("hosted-live/results.json").results },
  { name: "Actual hosted authenticated sessions", scope: "real approved staff/admin accounts; customer UI using staff account; read-only", data: read("authenticated-live/results.json").results },
  { name: "Hosted backend read-only checks", scope: "real Supabase anon/service read projections", data: read("live-data/results.json").results },
  { name: "Extra customer forms", scope: "hosted UI with isolated account/address writes", data: read("hosted-extra-customer/results.json").results },
  { name: "Extra admin modals", scope: "hosted UI with isolated data and failure injection", data: read("hosted-extra-admin/results.json").results },
  { name: "Signup/email recovery forms", scope: "hosted UI, intercepted Auth; no email/account creation", data: read("auth-forms/results.json").results },
  { name: "Remaining Admin forms, states and legacy modal", scope: "served UI, actual isolated SQL and explicit provider-response fixtures", data: read("admin-complete/results.json").results },
  { name: "Customer wallet", scope: "served UI, isolated vouchers and loyalty tiers", data: read("wallet/results.json").results },
  { name: "Customer scheduling UI", scope: "served UI, isolated windows/capacity/closures", data: read("customer-scheduling/results.json").results },
  { name: "Actual customer cloud writes", scope: "temporary real customer accounts and owner-only writes; cleanup verified", data: read("customer-live/results.json").results },
  { name: "Actual cash order interconnection", scope: "real unpaid guest order, POS/Admin reads and Realtime, cancellation and stock comparison", data: read("order-live/results.json").results },
  { name: "Actual Maya cancellation interconnection", scope: "real unpaid Maya guest order, hosted checkout/reuse/provider cancellation return and supported order cancellation", data: read("maya-order-live/results.json").results },
  { name: "Actual sandbox providers", scope: "hosted quote, sandbox booking/lookup/cancel, Maya checkout/merchant cancellation", data: read("provider-live/results.json").results },
  { name: "QR optical decoder", scope: "actual served decoder, synthetic camera pixels at three rotations", data: read("scanner/results.json").results },
  { name: "Actual Maya success outcome", scope: "real provider UI, published sandbox card; CAPTCHA gate", data: read("maya-ui/results.json").results },
  { name: "Final hosted cleanup", scope: "cancelled unpaid audit orders; zero temporary Auth/support records; read-only", data: read("cleanup-live/results.json").results },
  { name: "Actual hosted receipt print control", scope: "browser print action and print media on a cancelled audit order; no physical printer", data: read("receipt/results.json").results },
  { name: "Actual hosted geocoding", scope: "public hosted search/reverse Photon responses", data: read("location-live/results.json").results },
  ...(postFix ? [
    { name: "Required and optional form guidance", scope: "rendered field markers, red colour, phone layout and conditional guest help", data: read("form-guidance/results.json").results },
    { name: "Actual hosted repair regressions", scope: "hidden archived fixtures and future voucher, temporary customer tiers, scheduled push worker; exact cleanup", data: read("live-fixes/results.json").results },
  ] : []),
].map(group => ({ ...group, checks: group.data.length, passed: group.data.filter((row: { status: string }) => row.status === "PASS").length, failed: group.data.filter((row: { status: string }) => row.status === "FAIL").length, blocked: group.data.filter((row: { status: string }) => row.status === "BLOCKED").length }));
const summary = { generatedAt: new Date().toISOString(), dateTimezone: "Asia/Manila", hosted: "https://jaydscafe.vercel.app", sourceCommit: "b4d402f9c18b57b540f5245576c9b608460d3e4b", applicationChanges: false, liveBusinessWrites: true, liveWriteScope: "Temporary customer records cleaned up; unpaid guest test orders cancelled before preparation and retained in audit history; no charge or physical stock change", backend: { checks: units.length, passed: units.filter(row => row.status === "PASS").length, failed: units.filter(row => row.status === "FAIL").length, skipped: 0, executionNote: "Expanded run used normal process access and --no-wasm-code-gc; new category deletion regression fails against complete unchanged migrations" }, routes, groups, units, limits: ["Actual Maya success/decline/expiry/refund and café settlement/webhooks need human CAPTCHA and merchant workflow", "Sandbox courier quote/booking/cancel passed; rider transitions and provider webhook delivery remain unverified", "Real phone installation, physical camera scan and background push not completed; receipt printer is out of scope per user", "Inventory scheduling readiness and push configuration are incomplete", "Hosted paid preparation/collection, sustained load/soak, cron history and backup/restore are not certified", "No claim of every possible input combination or browser/platform coverage"] };
if (postFix) {
  const releaseFile = path.join(output, "release-source.json");
  summary.sourceCommit = existsSync(releaseFile) ? JSON.parse(readFileSync(releaseFile, "utf8")).sourceCommit : execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  summary.applicationChanges = true;
  summary.liveWriteScope = "Temporary customer owner writes cleaned up; two repair identities soft-retired with immutable legal acknowledgements retained; unpaid guest audit orders cancelled and retained in history, no charge or physical stock consumption";
  summary.backend.executionNote = "Complete backend regression run, including every forward migration and voucher-tier/category preservation controls; normal process access and --no-wasm-code-gc";
  summary.limits = [
    "Actual Maya success/decline/expiry/refund/settlement still requires human CAPTCHA and merchant workflow",
    "Sandbox courier quote/booking/cancel verified; real rider/provider webhook transitions remain unverified",
    "Physical phone installation, laptop webcam scan, audible alerts and background phone push remain direct device checks; no receipt printer is expected",
    "Scheduled pickup remains disabled until operator supplies capacities, closure/weekdays and fresh physical stock counts; supplied 13:00–22:00 hours are recorded without inventing missing values",
    "Build-tool dependency advisories remain; production dependency audit reports zero",
    "Sustained load/soak and backup/restore are not certified; passing counts are named scenarios, not exhaustive coverage percentages",
    "Dedicated tax/VAT, net profit after expenses/tax and business net worth are absent; user requested information only, no implementation",
  ];
  const files = [...new Set([
    ...execFileSync("git", ["diff", "--name-only", "b4d402f9c18b57b540f5245576c9b608460d3e4b"], { encoding: "utf8" }).split(/\r?\n/),
    ...execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" }).split(/\r?\n/),
  ])].filter(file => /^(apps\/|packages\/|supabase\/migrations\/|package(?:-lock)?\.json$|eslint\.config\.ts$)/.test(file) && existsSync(file));
  writeFileSync(path.join(output, "source-changes.json"), JSON.stringify({ baseCommit: "b4d402f9c18b57b540f5245576c9b608460d3e4b", recordedAt: new Date().toISOString(), files: files.map(file => ({ file, sha256: createHash("sha256").update(readFileSync(file)).digest("hex") })) }, null, 2));
}
writeFileSync(path.join(output, "audit-evidence.json"), JSON.stringify(summary, null, 2));
const inventory = ["# Source route inventory", "", "Routes found in the source at the audited revision. Existence does not mean every path/input passed; consult the coverage matrix and evidence JSON.", "", "| App | Kind | Route | Methods | Source |", "| --- | --- | --- | --- | --- |", ...routes.map(r => `| ${r.app} | ${r.kind} | ${r.route} | ${r.methods.join(", ")} | ${r.source} |`), ""].join("\n");
writeFileSync(path.join(output, "route-inventory.md"), inventory);
console.log(JSON.stringify({ backendTests: summary.backend, pages: routes.filter(r => r.kind === "page").length, apiFiles: routes.filter(r => r.kind === "api").length, groups: groups.map(({ name, checks, passed, failed, blocked }) => ({ name, checks, passed, failed, blocked })) }));
