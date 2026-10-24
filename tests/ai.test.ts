import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultAi, loadAi, parsePlan, requestFor, responseText, review } from "../src/ai";
import { reviewDocument, validatePlan } from "../src/html-review";
import { convert } from "../src/converter";
const plan = { changes: [], findings: ["Check table layout."] };
const doc = '<html><head><style>.hidden{display:none}</style></head><body><header>Intro</header><main><div id="cards"><span>Keep every word.</span></div><div> x   y\n 1   2</div><pre>protected code</pre></main><footer>End</footer></body></html>';

test("assistance is opt-in and credentials are isolated per provider", () => {
  const settings = defaultAi(); assert.equal(settings.provider, "off");
  settings.configs.bedrock.secretId = "bedrock-key"; assert.equal(settings.configs.openai.secretId, "");
  const loaded = loadAi({ provider: "profile", configs: { profile: { profile: "work", model: "other" } } });
  assert.equal(loaded.configs.profile.model, "global.openai.gpt-6-astra"); assert.equal(loaded.configs.profile.profile, "work");
  assert.equal(loadAi({ provider: "__proto__" }).provider, "off");
});
test("provider request fixtures keep keys out of URLs and disable server state where supported", () => {
  const settings = defaultAi();
  for (const p of ["bedrock", "gemini", "openai", "profile"] as const) {
    const r = requestFor(p, settings.configs[p], "sample-key", "document");
    assert(!r.url.includes("sample-key")); assert(!r.body.includes("sample-key"));
    const b = JSON.parse(r.body);
    if (p === "openai") { assert.equal(b.store, false); assert.equal(b.reasoning.effort, "low"); assert.equal(b.text.format.strict, true); }
    if (p === "gemini") { assert.equal(b.store, false); assert.equal(b.response_format.mime_type, "application/json"); assert.equal(r.headers["x-goog-api-key"], "sample-key"); }
    if (p === "profile") { assert.equal(r.url, "http://127.0.0.1:27183/review"); assert.equal(b.model, "global.openai.gpt-6-astra"); }
    assert(!("tools" in b));
  }
});
test("invalid configuration and oversize input fail before request", () => {
  const c = defaultAi().configs.bedrock;
  assert.throws(() => requestFor("bedrock", { ...c, region: "evil.example/path" }, "key", "x"));
  assert.throws(() => requestFor("openai", c, "key\n", "x"));
  assert.throws(() => requestFor("openai", c, "key", "x".repeat(240001)));
});
test("response adapters parse actual API envelopes and reject truncation or refusals", () => {
  const text = JSON.stringify(plan);
  assert.equal(responseText("openai", { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] }), text);
  assert.equal(responseText("gemini", { status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text }] }] }), text);
  assert.equal(responseText("bedrock", { stopReason: "end_turn", output: { message: { content: [{ text }] } } }), text);
  assert.throws(() => responseText("openai", { status: "incomplete", output: [] }));
  assert.throws(() => responseText("gemini", { status: "failed", steps: [] }));
  assert.throws(() => responseText("bedrock", { stopReason: "max_tokens" }));
  assert.throws(() => responseText("openai", { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }));
});
test("plans cannot contain replacement text, executable HTML, unknown formats or duplicate IDs", () => {
  for (const x of [{ ...plan, html: "<script>x</script>" }, { changes: [{ id: "n0", format: "delete" }], findings: [] },
    { changes: [{ id: "n0", format: "section", text: "rewritten" }], findings: [] },
    { changes: [{ id: "n0", format: "section" }, { id: "n0", format: "section" }], findings: [] }]) assert.throws(() => parsePlan(JSON.stringify(x)));
  assert.deepEqual(parsePlan(JSON.stringify(plan)), plan);
});
test("model input excludes script, image bytes, URLs, and form credentials", () => {
  const result = reviewDocument('<body><script>private-script</script><form><input value="private-form"></form><img src="data:image/png;base64,private-image" alt="Diagram"><a href="https://private.example">Link text</a><div>Article text</div></body>');
  for (const hidden of ["private-script", "private-form", "private-image", "private.example"]) assert(!result.includes(hidden));
  assert(result.includes("Article text")); assert(result.includes('data-paperlane-node="n0"')); assert(result.includes("Diagram"));
});
test("allowed formatting preserves original text and exact code whitespace", async () => {
  const a = await convert({ path: "x.html", format: "html", text: doc });
  const p = { changes: [{ id: "n1", format: "paragraph" as const }, { id: "n2", format: "preformatted" as const }], findings: [] };
  validatePlan(doc, p);
  const b = await convert({ path: "x.html", format: "html", text: doc }, { htmlPlan: p });
  for (const text of ["Intro", "Keep every word.", "protected code", "End"]) assert(b.text.includes(text));
  assert(b.html.includes('<pre> x   y\n 1   2</pre>')); assert(a.html.includes('<pre>protected code</pre>')); assert(b.html.includes('<pre>protected code</pre>'));
  assert.throws(() => validatePlan(doc, { changes: [{ id: "n500", format: "section" }], findings: [] }));
  assert.throws(() => validatePlan('<div><table><tr><td>x</td></tr></table></div>', { changes: [{ id: "n0", format: "paragraph" }], findings: [] }));
});
test("static tab panels and dialogs become readable sections with labels", async () => {
  const text = '<header>Intro</header><main><button id="tab-a">First tab</button><div role="tabpanel" aria-labelledby="tab-a" hidden><p>Panel content</p></div><dialog aria-label="Explanation"><p>Popup body</p></dialog><details><summary>More</summary><p>Details body</p></details></main><footer>Closing</footer>';
  const a = await convert({ path: "x.html", format: "html", text });
  for (const fragment of ["Intro", "Panel content", "Popup body", "Details body", "Closing", "<h3>First tab</h3>", "<h3>Explanation</h3>"]) assert(a.html.includes(fragment), fragment);
  assert(!a.html.includes(" hidden")); assert(!a.html.includes("<dialog")); assert(a.warnings.some(w => w.code === "panels"));
});
test("SVG dashed connectors and accessible labels survive preparation", async () => {
  let svg = "";
  const png = new Uint8Array([137,80,78,71,13,10,26,10]);
  const a = await convert({ path: "x.html", format: "html", text: '<svg aria-label="Flow diagram"><path d="M0 0L5 5" stroke-dasharray="5 4"/></svg>' }, { rasterizeSvg: async value => { svg = value; return png; } });
  assert(svg.includes('stroke-dasharray="5 4"')); assert.equal(a.images[0]?.alt, "Flow diagram");
});
test("failed providers do not retry, leak response bodies, or fall back", async () => {
  let calls = 0;
  await assert.rejects(review("openai", defaultAi().configs.openai, "sample-key", "doc", async () => {
    calls++; return { status: 403, json: { secret: "private response" } };
  }), error => error instanceof Error && !error.message.includes("private response") && !error.message.includes("sample-key"));
  assert.equal(calls, 1);
});

test("plan validation rejects block changes inside inline parents and conflicting parent changes", () => {
  assert.throws(() => validatePlan('<p><span>Words</span></p>', { changes: [{ id: "n0", format: "section" }], findings: [] }));
  assert.throws(() => validatePlan('<div><span>Words</span></div>', { changes: [{ id: "n0", format: "paragraph" }, { id: "n1", format: "section" }], findings: [] }));
});
