#!/usr/bin/env node
// Prune stale Cargo build artifacts, keeping only units used by recent builds.
//
// Cargo names every compiled unit `<name>-<16 hex hash>` across deps/, build/,
// .fingerprint/ and examples/; a changed dependency version, feature set or
// rustflags yields a new hash and the old one is never removed. A unit counts as
// used when any of its files was read or written (atime/mtime): a fresh build
// still reads the .fingerprint entry of every unit it depends on.
// The window is measured back from the newest activity in each profile, not from
// now, so a profile that has sat idle for a month is not wiped wholesale.
//
// Usage: node scripts/sweep-target.mjs [--dry-run] [--keep-days N] [target-dir...]

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const keepDaysArg = args.indexOf("--keep-days");
const keepDays = keepDaysArg >= 0 ? Number(args[keepDaysArg + 1]) : 3;
if (!Number.isFinite(keepDays) || keepDays < 0) {
  console.error("--keep-days must be a non-negative number");
  process.exit(1);
}
const targetDirs = args.filter((a, i) => !a.startsWith("--") && i !== keepDaysArg + 1);
if (targetDirs.length === 0) targetDirs.push("target");

const DAY_MS = 86_400_000;
const UNIT_DIRS = ["deps", "build", ".fingerprint", "examples"];
const UNIT_HASH = /-([0-9a-f]{16})(?:\.|$)/;

function walk(p, acc = { bytes: 0, lastUsed: 0 }) {
  let st;
  try {
    st = fs.lstatSync(p);
  } catch {
    return acc;
  }
  acc.lastUsed = Math.max(acc.lastUsed, st.atimeMs, st.mtimeMs);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(p)) walk(path.join(p, name), acc);
  } else {
    acc.bytes += st.size;
  }
  return acc;
}

function findProfiles(targetDir) {
  const profiles = [];
  const visit = (dir, depth) => {
    if (fs.existsSync(path.join(dir, ".fingerprint"))) profiles.push(dir);
    if (depth === 0) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith(".")) visit(path.join(dir, e.name), depth - 1);
    }
  };
  // target/<profile> and target/<triple>/<profile>
  visit(targetDir, 2);
  return profiles;
}

function collectGroups(profileDir) {
  const groups = new Map();
  const add = (key, p) => {
    const g = groups.get(key) ?? { paths: [], bytes: 0, lastUsed: 0 };
    const s = walk(p);
    g.paths.push(p);
    g.bytes += s.bytes;
    g.lastUsed = Math.max(g.lastUsed, s.lastUsed);
    groups.set(key, g);
  };
  for (const sub of UNIT_DIRS) {
    const dir = path.join(profileDir, sub);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const m = UNIT_HASH.exec(name);
      if (m) add(m[1], path.join(dir, name));
    }
  }
  // incremental/<crate>-<id> is per crate+config; rustc already GCs old sessions inside it.
  const inc = path.join(profileDir, "incremental");
  if (fs.existsSync(inc)) {
    for (const name of fs.readdirSync(inc)) add(`incremental/${name}`, path.join(inc, name));
  }
  return groups;
}

const gib = (n) => `${(n / 1024 ** 3).toFixed(2)} GiB`;
let totalFreed = 0;

for (const targetDir of targetDirs) {
  if (!fs.existsSync(targetDir)) continue;
  for (const profileDir of findProfiles(targetDir)) {
    const groups = collectGroups(profileDir);
    const newest = Math.max(0, ...[...groups.values()].map((g) => g.lastUsed));
    const cutoff = newest - keepDays * DAY_MS;
    let freed = 0;
    let removed = 0;
    for (const g of groups.values()) {
      if (g.lastUsed >= cutoff) continue;
      removed += 1;
      freed += g.bytes;
      if (!dryRun) for (const p of g.paths) fs.rmSync(p, { recursive: true, force: true });
    }
    totalFreed += freed;
    console.log(
      `${profileDir}: ${dryRun ? "would remove" : "removed"} ${removed}/${groups.size} units, ${gib(freed)}`,
    );
  }
}
console.log(`${dryRun ? "Would free" : "Freed"} ${gib(totalFreed)} (kept units used within ${keepDays} days of each profile's last build)`);
