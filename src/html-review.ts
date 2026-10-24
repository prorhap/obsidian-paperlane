import { unified } from "unified";
import rehypeParse from "rehype-parse";
import { toHtml } from "hast-util-to-html";
import { toText } from "hast-util-to-text";
import { visit } from "unist-util-visit";
import type { Element, Root, RootContent } from "hast";
import type { AiPlan } from "./ai";

const excluded = new Set(["script", "style", "head", "template", "iframe", "object", "embed", "canvas", "form", "svg", "math", "pre", "code"]);
const inline = new Set(["span", "b", "strong", "i", "em", "sub", "sup", "a", "code", "br", "small", "mark"]);
function inlineOnly(n: Element): boolean {
  return n.children.every(c => c.type === "text" || c.type === "comment" || (c.type === "element" && inline.has(c.tagName) && inlineOnly(c)));
}
export function reviewTree(html: string): Root {
  if (Buffer.byteLength(html) > 5 * 1024 * 1024) throw new Error("HTML exceeds the 5 MiB input limit.");
  const tree = unified().use(rehypeParse).parse(html);
  let nodes = 0;
  const check = (n: Root | RootContent, depth: number): void => {
    if (++nodes > 50000 || depth > 100) throw new Error("HTML is too complex to review.");
    if ("children" in n) for (const c of n.children) check(c, depth + 1);
  };
  check(tree, 0); return tree;
}
function targets(tree: Root): Map<string, Element> {
  const result = new Map<string, Element>();
  visit(tree, "element", n => {
    if (excluded.has(n.tagName)) return "skip";
    if (["div", "section", "aside", "span"].includes(n.tagName)) result.set(`n${result.size}`, n);
  });
  return result;
}
/** The model sees text and layout hints, never image bytes, URLs, script source or credential fields. */
export function reviewDocument(html: string): string {
  const tree = reviewTree(html), ids = new Map([...targets(tree)].map(([id, n]) => [n, id]));
  function clean(node: Root | Element): void {
    node.children = node.children.flatMap((c): RootContent[] => {
      if (c.type === "comment" || c.type === "doctype") return [];
      if (c.type !== "element") return [c];
      if (["script", "style", "head", "form"].includes(c.tagName)) return [];
      if (["svg", "img", "canvas", "iframe", "object", "embed", "template"].includes(c.tagName)) {
        const label = String(c.properties.alt || c.properties.ariaLabel || "");
        return [{ type: "element", tagName: "p", properties: {}, children: [{ type: "text", value: `[${c.tagName}: ${label || "content not provided"}]` }] }];
      }
      const props: Element["properties"] = {};
      for (const key of ["className", "role", "ariaLabel", "ariaLabelledBy", "ariaControls", "hidden"])
        if (c.properties[key] !== undefined) props[key] = c.properties[key];
      if (ids.has(c)) props.dataPaperlaneNode = ids.get(c)!;
      c.properties = props; clean(c); return [c];
    });
  }
  clean(tree);
  const result = toHtml(tree);
  if (Buffer.byteLength(result) > 240000) throw new Error("This document exceeds the AI review limit (240 KB). Local conversion remains available.");
  return result;
}
export function applyPlan(tree: Root, plan: AiPlan): void {
  const nodes = targets(tree);
  const parents = new Map<Element, Element>();
  visit(tree, "element", (n, _index, parent) => { if (parent?.type === "element") parents.set(n, parent); });
  const blockParents = new Set(["body", "main", "article", "section", "div", "aside", "header", "footer", "dialog", "li", "td", "th", "blockquote"]);
  const validated = plan.changes.map(change => {
    const n = nodes.get(change.id);
    if (!n) throw new Error("The review refers to an unknown or protected block.");
    const parent = parents.get(n);
    if (parent && !blockParents.has(parent.tagName)) throw new Error("A proposed block would break its parent layout.");
    if (change.format === "paragraph" && !inlineOnly(n)) throw new Error("A proposed paragraph would break nested block content.");
    if (change.format === "preformatted" && n.children.some(c => c.type !== "text" && c.type !== "comment"))
      throw new Error("Preformatted changes are limited to text-only blocks.");
    return { n, tag: change.format === "paragraph" ? "p" : change.format === "preformatted" ? "pre" : "section" };
  });
  const nextTags = new Map(validated.map(({ n, tag }) => [n, tag]));
  const staysInline = (n: Element): boolean => n.children.every(c => c.type !== "element" || (inline.has(nextTags.get(c) || c.tagName) && staysInline(c)));
  for (const { n, tag } of validated) if (tag === "p" && !staysInline(n)) throw new Error("Combined changes would put block content inside a paragraph.");
  // Validate the whole plan before touching a node; text and child order never change.
  for (const { n, tag } of validated) n.tagName = tag;
}
export function validatePlan(html: string, plan: AiPlan): void { applyPlan(reviewTree(html), plan); }
/** Expand static panels and dialogs; no JavaScript is run and no external content is fetched. */
export function flattenStaticPanels(tree: Root): number {
  const labels = new Map<string, string>();
  visit(tree, "element", n => { if (n.properties.id) labels.set(String(n.properties.id), toText(n).trim()); });
  let count = 0;
  visit(tree, "element", n => {
    if (excluded.has(n.tagName)) return "skip";
    if (n.tagName === "dialog" || ["tabpanel", "dialog", "alertdialog"].includes(String(n.properties.role))) {
      const title = String(n.properties.ariaLabel || "") || String(n.properties.ariaLabelledBy || "").split(/\s+/).map(id => labels.get(id) || "").join(" ").trim();
      n.tagName = "section";
      if (title && title.length <= 300 && !n.children.some(c => c.type === "element" && /^h[1-6]$/.test(c.tagName)))
        n.children.unshift({ type: "element", tagName: "h3", properties: {}, children: [{ type: "text", value: title }] });
      count++;
    }
    delete n.properties.hidden; delete n.properties.ariaHidden; delete n.properties.inert;
  });
  return count;
}

export function describePlan(html: string, plan: AiPlan): string[] {
  const nodes = targets(reviewTree(html));
  const labels = { section: "Section", paragraph: "Paragraph", preformatted: "Preserve spacing" };
  return plan.changes.map(c => `${labels[c.format]}: ${toText(nodes.get(c.id)!).replace(/\s+/g, " ").trim().slice(0, 100)}`);
}
