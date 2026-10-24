import test from "node:test";
import assert from "node:assert/strict";
import { assertVaultEntry, assertVaultRelativePath } from "../src/vault-boundary";

test("accepts indexed notes, images and export folders in the current vault", () => {
  const vault = {};
  for (const path of ["note.md", "attachments/image.png", "Paperlane Exports", "..valid.md"]) {
    const entry = { path, vault };
    assert.doesNotThrow(() => assertVaultEntry(entry, vault, p => p === path ? entry : null));
  }
});
test("rejects foreign, missing and stale entries even with the same path", () => {
  const vault = {}, entry = { path: "note.md", vault };
  assert.throws(() => assertVaultEntry(entry, {}, () => entry));
  assert.throws(() => assertVaultEntry(entry, vault, () => null));
  assert.throws(() => assertVaultEntry(entry, vault, () => ({ ...entry })));
});
test("rejects absolute, URI, traversal and malformed paths before lookup", () => {
  const vault = {};
  for (const path of ["", "/note.md", "C:/note.md", "file:///note.md", "../note.md", "a/../note.md", "./note.md", "a//b", "a/", "a\\b", "bad\0path"]) {
    assert.throws(() => assertVaultRelativePath(path));
    assert.throws(() => assertVaultEntry({ path, vault }, vault, () => assert.fail("must not look up malformed paths")));
  }
});
test("registered linked folders follow vault semantics without physical path resolution", () => {
  const vault = {}, entry = { path: "linked-folder/note.md", vault };
  assert.doesNotThrow(() => assertVaultEntry(entry, vault, () => entry));
});
