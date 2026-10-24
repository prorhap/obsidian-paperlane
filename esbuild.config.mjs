import { build } from "esbuild";
import { readFile } from "node:fs/promises";
const notices = `Paperlane\n\n${await readFile("LICENSE", "utf8")}\n${await readFile("THIRD_PARTY_NOTICES.md", "utf8")}`;
if (notices.includes("*/")) throw new Error("License notice would terminate the bundle comment.");
const result = await build({
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  loader: { ".py": "text" },
  format: "cjs",
  target: "es2022",
  platform: "browser",
  external: ["obsidian", "electron", "node:*"],
  minify: false,
  sourcemap: false,
  metafile: true,
  banner: { js: `/*! ${notices}\n*/` },
});
for (const output of Object.values(result.metafile.outputs)) {
  for (const dependency of output.imports) {
    if (/^(?:node:)?(?:fs|child_process)(?:\/|$)/.test(dependency.path)) {
      throw new Error(`Direct filesystem or shell dependency in runtime bundle: ${dependency.path}`);
    }
  }
}
