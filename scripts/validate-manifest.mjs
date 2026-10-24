import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const manifest = await readJson("manifest.json");
const pkg = await readJson("package.json");
const lock = await readJson("package-lock.json");
const versions = await readJson("versions.json");

// https://docs.obsidian.md/Reference/Manifest
assert(typeof manifest.id === "string" && /^[a-z-]+$/.test(manifest.id),
  "Plugin ID must contain only lowercase letters and hyphens.");
assert(!manifest.id.includes("obsidian") && !manifest.id.endsWith("plugin"),
  "Plugin ID cannot contain 'obsidian' or end with 'plugin'.");
for (const field of ["author", "name", "description", "version", "minAppVersion"]) {
  assert(typeof manifest[field] === "string" && manifest[field].trim(), `Missing manifest ${field}.`);
}
assert(/^\d+\.\d+\.\d+$/.test(manifest.version), "Version must use x.y.z.");
assert.equal(manifest.isDesktopOnly, true, "Node APIs require a desktop-only manifest.");
assert(manifest.description.length <= 250 && manifest.description.endsWith("."),
  "Description must be at most 250 characters and end with a period.");
assert.equal(pkg.version, manifest.version);
assert.equal(lock.version, manifest.version);
assert.equal(lock.packages[""].version, manifest.version);
assert.equal(versions[manifest.version], manifest.minAppVersion);
console.log("Manifest and package versions validated.");
