import { build } from "esbuild";
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
  banner: { js: "/* Paperlane - MIT; see LICENSE and THIRD_PARTY_NOTICES.md */" },
});
