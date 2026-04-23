#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const hikesDir = path.join(root, "public", "hikes");
const bucketName = "chakshu-assets";
const d1Database = "chakshu-core-prod";

function runWrangler(args) {
  execFileSync("npx", ["wrangler", ...args], {
    stdio: "inherit",
    env: { ...process.env, PATH: `/usr/local/bin:${process.env.PATH || ""}` },
  });
}

async function listFilesRecursive(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(absolute)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name === ".gitkeep") continue;
    files.push(absolute);
  }

  return files;
}

function toR2Key(absolutePath) {
  const relativeToPublic = path.relative(path.join(root, "public"), absolutePath);
  return relativeToPublic.split(path.sep).join("/");
}

async function main() {
  const files = await listFilesRecursive(hikesDir);
  if (!files.length) {
    console.log("No files found under public/hikes");
    return;
  }

  console.log(`Uploading ${files.length} files to R2 bucket ${bucketName}...`);
  for (let i = 0; i < files.length; i += 1) {
    const filePath = files[i];
    const key = toR2Key(filePath);
    console.log(`[${i + 1}/${files.length}] ${key}`);
    runWrangler(["r2", "object", "put", `${bucketName}/${key}`, "--remote", "--file", filePath]);
  }

  console.log("Rewriting D1 paths to R2-style keys...");
  runWrangler([
    "d1",
    "execute",
    d1Database,
    "--remote",
    "--command",
    [
      "UPDATE hikes",
      "SET gpx_path = CASE",
      "  WHEN gpx_path LIKE '/hikes/%' THEN substr(gpx_path, 2)",
      "  ELSE gpx_path",
      "END;",
      "UPDATE snapshots",
      "SET src_path = CASE",
      "  WHEN src_path LIKE '/hikes/%' THEN substr(src_path, 2)",
      "  ELSE src_path",
      "END;",
    ].join(" "),
  ]);

  console.log("Verifying remaining legacy /hikes/ prefixes...");
  runWrangler([
    "d1",
    "execute",
    d1Database,
    "--remote",
    "--command",
    "SELECT (SELECT COUNT(*) FROM hikes WHERE gpx_path LIKE '/hikes/%') AS hikes_legacy_prefix, (SELECT COUNT(*) FROM snapshots WHERE src_path LIKE '/hikes/%') AS snapshots_legacy_prefix;",
  ]);

  console.log("Migration completed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
