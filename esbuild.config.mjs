import { build } from "esbuild";
import { readFile } from "node:fs/promises";
const notices = `Paperlane\n\n${await readFile("LICENSE", "utf8")}\n${await readFile("THIRD_PARTY_NOTICES.md", "utf8")}`;
if (notices.includes("*/")) throw new Error("License notice would terminate the bundle comment.");
await build({
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  format: "cjs",
  target: "es2022",
  platform: "browser",
  external: ["obsidian", "electron", "node:*"],
  minify: false,
  sourcemap: false,
  banner: { js: `/*! ${notices}\n*/` },
});
