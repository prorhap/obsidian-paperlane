import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

/** Only resolves metadata; file contents are read/written through Obsidian's Vault API. */
export async function assertVaultPath(basePath: string, vaultPath: string): Promise<void> {
  if (isAbsolute(vaultPath) || vaultPath.includes("\0")) throw new Error("잘못된 볼트 경로입니다.");
  const base = await realpath(basePath);
  const target = await realpath(resolve(base, vaultPath));
  const rel = relative(base, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("볼트 밖으로 연결된 파일은 읽거나 쓰지 않습니다.");
  }
}
