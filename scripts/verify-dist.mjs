import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const requiredBuildFiles = [
  "dist/index.js",
  "dist/index.d.ts",
];

for (const file of requiredBuildFiles) {
  const fullPath = path.join(root, file);

  if (!fs.existsSync(fullPath)) {
    console.error(`Missing required build output: ${file}`);
    process.exit(1);
  }
}

const npmExecPath = process.env.npm_execpath;

if (!npmExecPath) {
  console.error("npm_execpath is not set. Run this verifier through npm.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    npmExecPath,
    "pack",
    "--dry-run",
    "--ignore-scripts",
    "--json",
  ],
  {
    cwd: root,
    encoding: "utf8",
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (result.status !== 0) {
  if (result.stdout) {
    console.error(result.stdout);
  }

  if (result.stderr) {
    console.error(result.stderr);
  }

  process.exit(result.status ?? 1);
}

let packResult;

try {
  packResult = JSON.parse(result.stdout);
} catch {
  console.error("Could not parse npm pack output.");
  console.error(result.stdout);
  process.exit(1);
}

if (!Array.isArray(packResult) || packResult.length !== 1) {
  console.error("Unexpected npm pack result.");
  process.exit(1);
}

const files = packResult[0].files.map((entry) =>
  entry.path.replaceAll("\\", "/"),
);

const allowedRootFiles = new Set([
  "package.json",
  "README.md",
  "LICENSE",
]);

const unexpectedFiles = files.filter(
  (file) =>
    !allowedRootFiles.has(file) &&
    !file.startsWith("dist/"),
);

if (unexpectedFiles.length > 0) {
  console.error("Unexpected files would be published:");

  for (const file of unexpectedFiles) {
    console.error(`  ${file}`);
  }

  process.exit(1);
}

const requiredPackageFiles = [
  "package.json",
  "README.md",
  "LICENSE",
  "dist/index.js",
  "dist/index.d.ts",
];

const missingPackageFiles = requiredPackageFiles.filter(
  (file) => !files.includes(file),
);

if (missingPackageFiles.length > 0) {
  console.error("Required files are missing from the npm package:");

  for (const file of missingPackageFiles) {
    console.error(`  ${file}`);
  }

  process.exit(1);
}

console.log(`Verified npm package contents: ${files.length} files.`);
