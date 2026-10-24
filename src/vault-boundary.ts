/** Validate logical vault paths, without resolving physical filesystem locations. */
export function assertVaultRelativePath(path: string): void {
  if (!path || path.startsWith("/") || path.includes("\\")
    || /^[a-z][a-z0-9+.-]*:/i.test(path)
    || Array.from(path).some(char => char.charCodeAt(0) < 32)
    || path.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error("정규화된 볼트 내부 경로만 사용할 수 있습니다.");
  }
}

/** Accept only the current vault's indexed object, not a path-equivalent external file. */
export function assertVaultEntry(
  entry: { path: string; vault: unknown },
  vault: unknown,
  lookup: (path: string) => unknown,
): void {
  assertVaultRelativePath(entry.path);
  if (entry.vault !== vault || lookup(entry.path) !== entry) {
    throw new Error("현재 볼트에 등록된 파일이나 폴더만 사용할 수 있습니다.");
  }
}
