import type { Root, RootContent } from "mdast";

/** Preserve tag spelling and nested paths; exclude categories and invalid tag names. */
export function normalizeTags(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/) : [];
  const result = new Set<string>();
  for (const item of values) {
    if (typeof item !== "string") continue;
    const tag = item.trim().replace(/^#/, "").normalize("NFC");
    if (/^[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u.test(tag) && /[\p{L}_-]/u.test(tag)) result.add(tag);
  }
  return [...result];
}

/** Read raw text-node spans so escaped hashes stay escaped. Never scan code or link destinations. */
export function inlineTags(tree: Root, source: string): string[] {
  const tags: string[] = [];
  const comments = [...source.matchAll(/%%[\s\S]*?(?:%%|$)/g)].map(match => [match.index, match.index + match[0].length]);
  function walk(node: Root | RootContent): void {
    if (["code", "inlineCode", "html", "link", "linkReference", "image", "imageReference", "definition"].includes(node.type)) return;
    if (node.type === "text") {
      const start = node.position?.start.offset, end = node.position?.end.offset;
      const raw = start !== undefined && end !== undefined ? source.slice(start, end) : node.value;
      for (const match of raw.matchAll(/(?:^|[\s([{])#([\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*)(?![\p{L}\p{N}_/-])/gu)) {
        const offset = (start ?? 0) + match.index + match[0].indexOf("#");
        if (comments.some(([from, to]) => offset >= from! && offset < to!)) continue;
        if (match[1]) tags.push(match[1]);
      }
    } else if ("children" in node) {
      for (const child of node.children) walk(child);
    }
  }
  walk(tree);
  return normalizeTags(tags);
}
