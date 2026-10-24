import { mkdir, writeFile, readFile } from "node:fs/promises";
import { convert } from "../src/converter";
import { exportHtml } from "../src/template";
await mkdir("output/playwright", {recursive:true});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="260" viewBox="0 0 640 260">
<rect width="640" height="260" fill="#e8ede5"/><rect x="48" y="52" width="160" height="156" rx="12" fill="#386846"/>
<rect x="240" y="102" width="160" height="106" rx="12" fill="#739b6d"/><rect x="432" y="142" width="160" height="66" rx="12" fill="#a7bd91"/>
</svg>`;
await writeFile("output/playwright/diagram.svg",svg);
// A static public-domain test pattern generated locally; no real user document is uploaded.
const png = new Uint8Array(await readFile("output/playwright/pattern.png"));
const source = {
  path:"demo.md", format:"md" as const,
  text:"# 그림과 함께 읽는 문서\n\n이 문서는 **외부 업로드 없이** 로컬 그림을 HTML 안에 넣는 기능을 확인합니다.\n\n## 문서에 포함된 그림\n\n![로컬 테스트 패턴](pattern.png)\n\n## 비교 표\n\n| 방식 | 그림 위치 | 외부 업로드 |\n|---|---|---|\n| 내장 HTML | HTML 안 | 필요 없음 |\n| URL 참조 | 웹 서버 | 접근 가능한 주소 필요 |\n\n> [!NOTE] Instapaper 확인\n> 로컬 HTML에서 보이는 것과 Instapaper 보존은 별도로 검증합니다.\n\n```html\n<img src=\"data:image/png;base64,...\">\n```\n\n근거는 각주에 남깁니다.[^1]\n\n[^1]: Instapaper 공식 API 문서. 마지막 문단입니다.",
};
const a=await convert(source,{readAsset:async r=>({path:r,bytes:png})});
await writeFile("output/playwright/demo.html",exportHtml(a));
console.log("Created output/playwright/demo.html");
