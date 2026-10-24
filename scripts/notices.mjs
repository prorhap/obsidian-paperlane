import { readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
const paths = execFileSync("npm", ["ls", "--omit=dev", "--parseable"], {encoding:"utf8"}).trim().split("\n").slice(1);
let text = "# Third-party notices\n\nRuntime dependencies bundled in main.js. The project itself is MIT licensed; see LICENSE.\n\n";
for (const path of paths) {
  const pkg = JSON.parse(await readFile(join(path, "package.json"), "utf8"));
  text += `## ${pkg.name} ${pkg.version}\n\nLicense: ${pkg.license || "See package license"}\n\n`;
  const names = (await readdir(path)).filter(n => /^licen[cs]e(?:[.-]|$)/i.test(n));
  for (const name of names) {
    text += "```text\n" + await readFile(join(path, name),"utf8") + "\n```\n\n";
  }
}
await writeFile("THIRD_PARTY_NOTICES.md", text.trimEnd() + "\n");
