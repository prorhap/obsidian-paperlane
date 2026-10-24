import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const directory = `dist/${manifest.id}`;
await mkdir(directory, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
  await copyFile(file, `${directory}/${file}`);
}
const zip = `${manifest.id}-${manifest.version}.zip`;
execFileSync("zip", ["-q", "-r", zip, manifest.id], { cwd: "dist" });
const digest = createHash("sha256").update(await readFile(`dist/${zip}`)).digest("hex");
await writeFile("dist/SHA256SUMS", `${digest}  ${zip}\n`);
console.log(`Created dist/${zip}`);
