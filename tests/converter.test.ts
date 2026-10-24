import { test } from "node:test";
import assert from "node:assert/strict";
import { convert, cleanHtml } from "../src/converter";
import { bytesToData, imageMime, publicImageUrl, sanitizeSvg, validatedDataImage } from "../src/images";
import { exportHtml } from "../src/template";
import { verify } from "../src/verification";
const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64"));
const md = (text: string) => ({ path: "notes/한국어.md", format: "md" as const, text });
const html = (text: string) => ({ path: "notes/article.html", format: "html" as const, text });

test("Markdown retains Korean, tables, code and all footnote text", async () => {
  const a = await convert(md("---\ntitle: 시험 문서\nprivate: secret\n---\n# 제목\n한글 **강조** 😀[^a]\n\n| 열 | 값 |\n|---|---|\n| 이름 | 테스트 |\n\n```js\nconst x = '[[literal]]';\n```\n\n[^a]: 마지막 출처 https://example.com"));
  assert.equal(a.title, "시험 문서"); assert(!a.html.includes("secret"));
  for (const s of ["한글","<table>","테스트","[[literal]]","마지막 출처"]) assert(a.html.includes(s), s);
  assert(a.html.includes('href="#s2r-'));
});
test("Wiki image resolves to actual embedded bytes; code remains unchanged", async () => {
  const a = await convert(md("![[사진.png|320]]\n\n[[다른 문서|별칭]]\n\n`![[not-image.png]]`"), {
    readAsset: async r => { assert.equal(decodeURIComponent(r), "사진.png"); return { path: r, bytes: png }; },
  });
  assert.equal(a.images.length, 1);
  assert.equal(a.images[0]!.state, "embedded");
  assert(a.html.includes(bytesToData(png, "image/png")));
  assert(a.html.includes("별칭")); assert(a.html.includes("![[not-image.png]]"));
});
test("Missing local image is an explicit loss, never a broken local src", async () => {
  const a = await convert(md("내용\n\n![없음](missing.png)"));
  assert.equal(a.images[0]!.state, "missing");
  assert(a.warnings.some(w => w.loss));
  assert(!a.html.includes('src="missing'));
});
test("HTTPS mapping provides a supported URL without uploading any file", async () => {
  let reads = 0;
  const a = await convert(md("![그림](a.png)"), { imageUrls: { "a.png": "https://images.example.com/a.png" },
    readAsset: async () => { reads++; return null; } });
  assert.equal(reads, 0); assert.equal(a.images[0]!.state, "mapped");
});
test("HTML script, iframe, event handlers and dangerous links are removed", async () => {
  const a = await convert(html('<title>HTML 제목</title><article><h1>본문</h1><script>alert(1)</script><iframe src="https://evil.example"></iframe><p onclick="x()">문장</p><a href="jav&#x61;script:alert(2)">링크</a></article>'));
  assert.equal(a.title, "HTML 제목");
  assert(!a.html.includes("<script")); assert(!a.html.includes("<iframe"));
  assert(!a.html.includes("onclick")); assert(!a.html.includes("javascript:"));
  assert(a.warnings.some(w => w.code === "unsupported"));
});
test("Lazy placeholder replaced with final data-src", async () => {
  const a = await convert(html(`<p>그림</p><img src="${bytesToData(png, "image/png")}" data-src="https://img.example.com/full.png" alt="원본">`));
  assert.equal(a.images[0]!.src, "https://img.example.com/full.png");
  assert(a.warnings.some(w => w.code === "lazy-image"));
});
test("Responsive srcset chooses largest explicit candidate, not the tiny placeholder", async () => {
  const a = await convert(html('<p>내용</p><img src="https://img.example.com/tiny.png" data-srcset="https://img.example.com/a.png 400w, https://img.example.com/b.png 1200w">'));
  assert.equal(a.images[0]!.src, "https://img.example.com/b.png");
});
test("picture source can provide full-size image", async () => {
  const a = await convert(html(`<picture><source srcset="https://img.example.com/a.png 400w, https://img.example.com/b.png 1200w"><img src="${bytesToData(png,"image/png")}" alt="사진"></picture>`));
  assert.equal(a.images[0]!.src, "https://img.example.com/b.png");
});
test("Unresolved width/quality template is not declared a usable remote image", async () => {
  const a = await convert(html('<p>내용</p><img data-src="https://img.example.com/{width}/{quality}/a.png">'));
  assert.equal(a.images[0]!.state, "missing");
});
test("Article extraction is optional and does not discard multiple candidates", async () => {
  const s = html("<body><nav>탐색</nav><article><p>본문</p></article></body>");
  assert(!(await convert(s)).text.includes("탐색"));
  assert((await convert(s, { wholeBody: true })).text.includes("탐색"));
  const a = await convert(html("<article>첫째</article><article>둘째</article>"));
  assert(a.text.includes("첫째") && a.text.includes("둘째"));
});
test("Table-list mode retains headers and every cell", async () => {
  const a = await convert(md("| A | B |\n|---|---|\n| 하나 | 둘 |\n"), { tableLists: true });
  assert(!a.html.includes("<table")); for (const s of ["A:","B:","하나","둘"]) assert(a.html.includes(s));
});
test("Callout and collapsed details retain content", async () => {
  const a = await convert(md("> [!NOTE] 제목\n> 설명\n\n<details><summary>요약</summary><p>숨은 내용</p></details>"));
  assert(a.html.includes("NOTE:")); assert(a.html.includes("숨은 내용")); assert(!a.html.includes("<details"));
});
test("Dynamic Mermaid is marked as loss rather than pretending to render", async () => {
  const a = await convert(md("```mermaid\ngraph TD\nA-->B\n```"));
  assert(a.warnings.some(w => w.code === "dynamic" && w.loss));
});
test("SVG is sanitized before raster callback", async () => {
  let called = false;
  const a = await convert(html('<svg viewBox="0 0 20 20"><script>x()</script><foreignObject>evil</foreignObject><image href="https://evil.example/x"/><rect width="20" height="20" fill="red"/></svg>'), {
    rasterizeSvg: async s => {
      called = true; assert(!s.includes("script")); assert(!s.includes("foreignObject"));
      assert(!s.includes("evil.example")); assert(s.includes("rect")); return png;
    },
  });
  assert(called); assert.equal(a.images[0]!.state, "embedded");
});
test("SVG sanitizer drops external paint references", () => {
  const s = sanitizeSvg('<svg><rect fill="url(https://evil.example/x)" style="background:url(https://evil.example)"/></svg>');
  assert(!s.includes("evil.example")); assert(!s.includes("style="));
});
test("Only valid raster data URIs are accepted", () => {
  assert(validatedDataImage(bytesToData(png, "image/png")));
  assert.equal(validatedDataImage("data:image/png;base64,PHNjcmlwdD4="), null);
  assert.equal(validatedDataImage("data:image/svg+xml;base64,PHN2Zz4="), null);
  assert.equal(imageMime(new TextEncoder().encode("<html>")), null);
});
test("Private, local, credentialed and IP image URLs are rejected", () => {
  for (const s of ["https://localhost/x", "https://192.168.1.1/x", "https://2130706433/x",
    "https://[::1]/x", "https://a.local/x", "https://user:pass@example.com/x", "http://example.com/x"])
    assert.equal(publicImageUrl(s), null, s);
});
test("Preview never requests external images and preserves embedded ones", () => {
  const s = cleanHtml(`<img src="https://img.example.com/x.png" alt="외부 그림"><img src="${bytesToData(png,"image/png")}">`, true);
  assert(!s.includes("https://img.example.com"));
  assert(s.includes("외부 그림")); assert(s.includes("data:image/png"));
});
test("Export has standalone blog styling and CSP without executing source scripts", async () => {
  const a = await convert(md("# 블로그\n\n![사진](a.png)"), { readAsset: async r => ({path:r,bytes:png}) });
  const s = exportHtml(a);
  assert(s.includes("Content-Security-Policy")); assert(s.includes("@media"));
  assert(s.includes("data:image/png")); assert(!s.includes("<script"));
});
test("Image verification detects removal and duplication mismatch", async () => {
  const a = await convert(md("![A](https://img.example.com/a.png)\n\n![B](https://img.example.com/a.png)"));
  assert.equal(verify(a, {content:{body:a.html}}).length,0);
  const missing = verify(a, {content:{body:'<img src="https://img.example.com/a.png">'}});
  assert(missing.some(n => n.includes("그림 참조")));
});
test("Parser side-list alone is not proof an image remains in the article", async () => {
  const a = await convert(md("내용\n\n![A](https://img.example.com/a.png)"));
  const notes = verify(a, {content:{body:"<p>내용</p>",images:["https://img.example.com/a.png"]}});
  assert(notes.some(n => n.includes("그림 참조")));
});
test("Body tail removal is detected even when most text survives", async () => {
  const a = await convert(md("첫 문단입니다.\n\n둘째 문단입니다.\n\n마지막 중요한 문단입니다."));
  assert(verify(a, {content:{body:"<p>첫 문단입니다.</p><p>둘째 문단입니다.</p>"}}).some(n => n.includes("본문")));
});
test("Excessively large input is rejected without truncating", async () => {
  await assert.rejects(convert(md("x".repeat(5*1024*1024+1))), /5 MiB/);
});
