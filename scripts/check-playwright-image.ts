// The pixel goldens are only valid inside one exact Playwright container. This checks
// that every workflow's container image tag equals the @playwright/test version in
// package-lock.json (and package.json). With --docker it then runs the pixel tests in
// that container:
//
//   node scripts/check-playwright-image.ts              # check only
//   node scripts/check-playwright-image.ts --docker [playwright args]
//   npm run test:pixel:docker -- --update-snapshots     # regenerate the goldens

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const IMAGE = "mcr.microsoft.com/playwright";

type Lock = { packages: Record<string, { version?: string }> };
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as Lock;
const version = lock.packages["node_modules/@playwright/test"]?.version;
if (!version) {
  process.stderr.write("check-playwright-image: @playwright/test is not in package-lock.json\n");
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  devDependencies: Record<string, string>;
};
const problems: string[] = [];
if (pkg.devDependencies["@playwright/test"] !== version) {
  problems.push(
    `package.json pins @playwright/test ${pkg.devDependencies["@playwright/test"]}, lockfile has ${version}`,
  );
}
const want = `${IMAGE}:v${version}-noble`;
for (const wf of ["ci.yml", "release.yml"]) {
  const path = join(root, ".github", "workflows", wf);
  if (!existsSync(path)) continue;
  const text = readFileSync(path, "utf8");
  const found = [...text.matchAll(/mcr\.microsoft\.com\/playwright:[^\s"']+/g)].map((m) => m[0]);
  if (found.length === 0) problems.push(`${wf}: no ${IMAGE} image`);
  for (const f of found) {
    if (f !== want) problems.push(`${wf}: image ${f}, want ${want}`);
  }
}
if (problems.length > 0) {
  for (const p of problems) process.stderr.write(`check-playwright-image: ${p}\n`);
  process.exit(1);
}
console.log(`playwright image ok: ${want}`);

const args = process.argv.slice(2);
if (args[0] === "--docker") {
  const rest = args.slice(1);
  const inner =
    "npm ci && npm run build && npx playwright test --project=webkit pixel.spec.ts " +
    rest.map((a) => `'${a.replaceAll("'", "'\\''")}'`).join(" ");
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "--ipc=host",
      "-v",
      `${root}:/work`,
      "-v",
      "synod-player-node-modules:/work/node_modules",
      "-w",
      "/work",
      want,
      "bash",
      "-c",
      inner,
    ],
    { stdio: "inherit" },
  );
}
