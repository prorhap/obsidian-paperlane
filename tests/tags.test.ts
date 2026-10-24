import test from "node:test";
import assert from "node:assert/strict";
import { convert } from "../src/converter";
import { InstapaperClient } from "../src/client";
import { normalizeTags } from "../src/tags";

const source = { path: "tagged.md", format: "md" as const, text: `---
title: Tags
tags: [coffee, reading, topic/nested]
categories: ['[[Medical]]']
---
# Heading

#coffee #새태그 #topic/nested \\#escaped #123

\`#inline-code\` [link](https://example.com/#fragment)

\`\`\`text
#fenced-code
\`\`\`
` };
test("tag sync is opt-in and combines frontmatter and inline tags without code, headings or categories", async () => {
  assert.equal((await convert(source)).tags, undefined);
  assert.equal((await convert(source, { syncTags: false })).tags, undefined);
  assert.deepEqual((await convert(source, { syncTags: true })).tags, ["coffee", "reading", "topic/nested", "새태그"]);
});
test("normalizes scalar and array tags and rejects invalid names", () => {
  assert.deepEqual(normalizeTags("#coffee, reading topic/nested"), ["coffee", "reading", "topic/nested"]);
  assert.deepEqual(normalizeTags(["coffee", "coffee", 123, null, "bad tag", "/bad", "123", "a//b"]), ["coffee"]);
});
test("HTML text hashtags are not treated as Obsidian tags", async () => {
  const a = await convert({ path: "a.html", format: "html", text: "<p>#plain</p>" }, { syncTags: true });
  assert.deepEqual(a.tags, []);
});
test("save sends official tag objects only when requested", async () => {
  let payload: unknown;
  const client = new InstapaperClient(async (_path, _method, body) => { payload = body; return { status: 200, json: { id: 1 } }; });
  await client.save(await convert(source, { syncTags: true }), "test");
  assert.deepEqual((payload as { tags: unknown }).tags, [{ name: "coffee" }, { name: "reading" }, { name: "topic/nested" }, { name: "새태그" }]);
  await client.save(await convert(source, { syncTags: false }), "test");
  assert.equal(Object.hasOwn(payload as object, "tags"), false);
});

 test("hidden Obsidian comments do not become tags", async () => {
  const a = await convert({ path: "a.md", format: "md", text: "Body #visible\n%% #hidden\n**#also-hidden** %%" }, { syncTags: true });
  assert.deepEqual(a.tags, ["visible"]);
});
