import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertVaultPath } from "../src/vault-boundary";

test("vault boundary resolves links and rejects external sources and export folders", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "paperlane-boundary-"));
  try {
    const vault = join(fixture, "vault");
    const outside = join(fixture, "vault-other");
    await mkdir(vault);
    await mkdir(outside);
    await writeFile(join(vault, "note.md"), "inside");
    await writeFile(join(vault, "..valid.md"), "inside");
    await writeFile(join(outside, "private.md"), "outside");
    await symlink(join(vault, "note.md"), join(vault, "inside-link.md"));
    await symlink(join(outside, "private.md"), join(vault, "external-link.md"));
    await symlink(outside, join(vault, "Paperlane Exports"));
    await symlink(vault, join(fixture, "vault-alias"));

    for (const path of ["note.md", "..valid.md", "inside-link.md"]) {
      await assertVaultPath(vault, path);
    }
    await assertVaultPath(join(fixture, "vault-alias"), "note.md");
    for (const path of ["external-link.md", "Paperlane Exports", "../vault-other/private.md"]) {
      await assert.rejects(assertVaultPath(vault, path), /볼트 밖/);
    }
    await assert.rejects(assertVaultPath(vault, join(outside, "private.md")), /잘못된/);
    await assert.rejects(assertVaultPath(vault, "bad\0path"), /잘못된/);
    await assert.rejects(assertVaultPath(vault, "missing.md"));
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
