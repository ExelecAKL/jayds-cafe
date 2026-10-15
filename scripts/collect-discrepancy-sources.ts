// Capture only application/test sources; private registration and runtime files stay excluded.
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const scopes = [
  "apps",
  "packages",
  "supabase/migrations",
  "tests",
  "scripts/collect-discrepancy-sources.ts",
];
const git = (args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", windowsHide: true }).trim();
const files = [
  ...new Set(
    [
      ...git(["diff", "--name-only", "-z", "HEAD", "--", ...scopes]).split(
        "\0",
      ),
      ...git([
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        ...scopes,
      ]).split("\0"),
    ].filter(Boolean),
  ),
].sort();
const sources = files.map((path) => {
  const bytes = readFileSync(path);
  return {
    path,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
});
mkdirSync("docs/audits/evidence", { recursive: true });
const report = {
  captured_at: new Date().toISOString(),
  timezone: "Asia/Manila",
  branch: git(["branch", "--show-current"]),
  base_commit: git(["rev-parse", "HEAD"]),
  source_count: sources.length,
  sources,
};
writeFileSync(
  "docs/audits/evidence/2026-10-16-discrepancy-sources.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    source_count: sources.length,
    private_registration_excluded: true,
    report: "docs/audits/evidence/2026-10-16-discrepancy-sources.json",
  }),
);
