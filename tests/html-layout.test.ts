import { test } from "node:test";
import assert from "node:assert/strict";
import { unified } from "unified";
import parse from "rehype-parse";
import { toHtml } from "hast-util-to-html";
import { visit } from "unist-util-visit";
import { applyReadingLayout, layoutDocument, type LayoutHint } from "../src/html-layout";
import { convert } from "../src/converter";
import { svgSize } from "../src/svg-size";

test("Layout probe removes executable content, resources and event handlers without changing the original", () => {
  const source = '<style>.note{display:block}</style><base href="https://bad.test"><script>danger()</script><iframe srcdoc="danger"></iframe><form><input></form><p onclick="danger()">safe<img src="https://bad.test/a" srcset="https://bad.test/b 2x"></p><svg><script>danger()</script></svg>';
  const tree = unified().use(parse).parse(source);
  const before = toHtml(tree), probe = layoutDocument(tree);
  assert.equal(toHtml(tree), before);
  assert(probe.includes(".note{display:block}"));
  for (const text of ["danger", "https://", "<form", "<script", "<svg", "<iframe", "<base", "onclick", "srcset"])
    assert(!probe.includes(text), text);
});

test("CSS block labels and multiline formulas retain boundaries while code stays byte-identical", () => {
  const tree = unified().use(parse).parse('<div><b class="label">Step</b><span>Explanation</span></div><div class="formula">a = b\nc = d</div><pre> x\n  y</pre><h2 class="heading"><span>01</span>Heading</h2>');
  const hints: LayoutHint[] = [];
  let id = 0;
  visit(tree, "element", n => {
    const cls = String(n.properties.className || "");
    hints.push({ id: id++, display: cls === "label" ? "block" : cls === "heading" ? "flex" : "inline",
      whiteSpace: cls === "formula" ? "pre-wrap" : "normal", gap: cls === "heading" });
  });
  assert(applyReadingLayout(tree, hints) > 0);
  const html = toHtml(tree);
  assert(html.includes('<br><b class="label">Step</b><br><span>Explanation'));
  assert(html.includes('a = b<br>c = d'));
  assert(html.includes('<pre> x\n  y</pre>'));
  assert(html.includes('<span>01</span> Heading'));
});

test("Failed browser layout inspection is explicit and requires loss acknowledgement", async () => {
  const article = await convert({ path: "a.html", format: "html", text: "<p>Readable text</p>" }, {
    inspectLayout: async () => { throw new Error("timeout"); },
  });
  assert(article.html.includes("Readable text"));
  assert(article.warnings.some(w => w.code === "layout-inspection" && w.loss));
});

test("Verification checkpoints include card text, captions and lower-level headings", async () => {
  const article = await convert({ path: "a.html", format: "html", text: "<div>Card text</div><h4>Small heading</h4><figure><figcaption>Diagram caption</figcaption></figure>" });
  for (const text of ["Card text", "Small heading", "Diagram caption"]) assert(article.checkpoints.includes(text));
});

test("SVG viewBox sets readable intrinsic dimensions and bounded retina scaling", () => {
  assert.deepEqual(svgSize(null, null, "0 0 760 300"), { width: 760, height: 300, scale: 2 });
  assert.deepEqual(svgSize("100%", null, "0 0 760 300"), { width: 760, height: 300, scale: 2 });
  assert.deepEqual(svgSize("380px", null, "0 0 760 300"), { width: 380, height: 150, scale: 2 });
  assert(svgSize("4000", "4000", null).scale === 1);
  assert.throws(() => svgSize(null, null, "0 0 9000 200"), /limit/);
});

test("HTML reading lists preserve merged headers, row spans, captions and cell links", async () => {
  const article = await convert({path:"a.html",format:"html",text:`<table><caption>Results</caption>
    <tr><th rowspan="2">Device</th><th colspan="2">Score</th></tr>
    <tr><th>First</th><th>Second</th></tr>
    <tr><td rowspan="2">Alpha</td><td>10</td><td>20</td></tr>
    <tr><td>30</td><td><a href="https://example.com">40</a></td></tr>
    <tr><td colspan="2">Total</td><td>100</td></tr></table>`});
  assert(!article.html.includes("<table"));
  assert(article.html.includes("Results"));
  assert.equal(article.html.match(/Device: <\/strong>Alpha/g)?.length, 2);
  assert(article.html.includes("Score / Second: </strong>100"));
  assert(article.html.includes('href="https://example.com"'));
});

test("HTML table preservation is an explicit opt-out and header-only tables do not vanish", async () => {
  const source = {path:"a.html",format:"html" as const,text:"<table><tr><th>Only heading</th></tr></table>"};
  assert((await convert(source)).html.includes("Only heading"));
  assert((await convert(source,{tableLists:false})).html.includes("<table>"));
});

test("HTML internal link labels and citation numbers survive readers that discard fragment anchors", async () => {
  const article = await convert({path:"a.html",format:"html",text:'<p>See <a href="#cache">KV cache</a> and reference <a href="#r1">1</a>.</p><h2 id="cache">Cache</h2><p id="r1"><a href="https://example.com/paper">Source</a></p>'});
  assert(!article.html.includes('href="#'));
  assert(article.html.includes("<span>KV cache</span>"));
  assert(article.html.includes("<span>[1]</span>"));
  assert(article.html.includes('href="https://example.com/paper"'));
});

test("A distinct HTML heading is preserved below the bookmark title", async () => {
  const article = await convert({path:"a.html",format:"html",text:"<title>Saved title</title><h1>Original subtitle</h1><p>Body</p>"});
  assert(article.html.includes("<h2>Original subtitle</h2>"));
});
