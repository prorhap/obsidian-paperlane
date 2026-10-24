import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("release validation rejects mixed README names, invalid IDs, and mismatched tags", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "paperlane-manifest-"));
  const script = resolve("scripts/validate-manifest.mjs");
  try {
    for (const name of ["manifest.json", "package.json", "package-lock.json", "versions.json", "README.md"]) {
      await writeFile(join(fixture, name), await readFile(name));
    }
    const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
    const run = (tag = manifest.version) => spawnSync(process.execPath, [script], {
      cwd: fixture, encoding: "utf8", env: { ...process.env, RELEASE_TAG: tag },
    });
    assert.equal(run().status, 0);
    assert.notEqual(run("0.0.0").status, 0);
    await writeFile(join(fixture, "README.md"), "# An obsolete display name\n");
    assert.notEqual(run().status, 0);
    await writeFile(join(fixture, "README.md"), `# ${manifest.name}\n`);
    await writeFile(join(fixture, "manifest.json"), JSON.stringify({ ...manifest, id: "send2instapaper" }));
    assert.notEqual(run().status, 0);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
