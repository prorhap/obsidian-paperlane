import type { Element, Root, RootContent } from "hast";
import { toHtml } from "hast-util-to-html";
import { visit } from "unist-util-visit";

export interface LayoutHint { id: number; display: string; whiteSpace: string; gap: boolean }
const excluded = new Set(["script", "iframe", "object", "embed", "canvas", "form", "template", "svg", "math"]);
const inline = new Set(["span", "b", "strong", "em", "i", "small", "mark", "a", "code"]);

/** Build a separate, inert layout probe. Never insert the original document into Obsidian. */
export function layoutDocument(tree: Root): string {
  const copy = structuredClone(tree);
  let index = 0;
  visit(copy, "element", n => {
    const id = index++;
    const props: Element["properties"] = { dataPaperlaneLayout: String(id) };
    for (const key of ["id", "className", "style", "hidden", "open", "role"])
      if (n.properties[key] !== undefined) props[key] = n.properties[key];
    n.properties = props;
    // Retain element indexes, but remove active content and all resource URLs.
    if (excluded.has(n.tagName)) { n.tagName = "div"; }
  });
  function prune(n: Root | Element, original: Root | Element): void {
    n.children = n.children.flatMap((c, i): RootContent[] => {
      const before = original.children[i];
      if (c.type !== "element" || before?.type !== "element") return [c];
      if (excluded.has(before.tagName) || ["link", "meta", "base"].includes(before.tagName)) return [];
      prune(c, before); return [c];
    });
  }
  prune(copy, tree);
  return toHtml(copy);
}

/** Keep CSS-created text boundaries using semantic HTML, without keeping author CSS. */
export function applyReadingLayout(tree: Root, hints: LayoutHint[]): number {
  const nodes: Element[] = [];
  visit(tree, "element", n => { nodes.push(n); });
  const styles = new Map(hints.map(h => [nodes[h.id], h]));
  let changes = 0;
  const br = (): Element => ({ type: "element", tagName: "br", properties: {}, children: [] });
  function walk(n: Root | Element, protectedText = false): void {
    if (n.type === "element" && excluded.has(n.tagName)) return;
    const inPre = protectedText || (n.type === "element" && ["pre", "style"].includes(n.tagName));
    const style = n.type === "element" ? styles.get(n) : undefined;
    const lines = !inPre && style && ["pre", "pre-wrap", "pre-line", "break-spaces"].includes(style.whiteSpace);
    n.children = n.children.flatMap((c): RootContent[] => {
      if (c.type === "text" && lines && c.value.includes("\n")) {
        changes++;
        return c.value.split("\n").flatMap((value, i) => i ? [br(), { type: "text" as const, value }] : [{ type: "text" as const, value }]);
      }
      if (c.type !== "element") return [c];
      walk(c, inPre);
      const hint = styles.get(c);
      if (!inPre && inline.has(c.tagName) && hint && ["block", "flex", "grid", "table", "list-item"].includes(hint.display)) {
        changes++;
        return [br(), c, br()];
      }
      // A flex/grid gap can separate badges or labels without any whitespace in the HTML.
      if (!inPre && style?.gap && /flex|grid/.test(style.display)) {
        changes++;
        return [c, { type: "text", value: " " }];
      }
      return [c];
    });
  }
  walk(tree);
  return changes;
}

/** Host-browser style inspection only; CSP and sandbox prevent scripts and network access. */
export async function inspectHtmlLayout(html: string): Promise<LayoutHint[]> {
  const frame = createEl("iframe", { cls: "s2r-layout-probe" });
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">`;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("HTML layout inspection timed out.")), 5000);
      frame.onload = () => { window.clearTimeout(timer); resolve(); };
      frame.onerror = () => { window.clearTimeout(timer); reject(new Error("HTML layout inspection failed.")); };
      frame.srcdoc = html.replace(/<head(?:\s[^>]*)?>/i, match => `${match}${csp}`);
      document.body.appendChild(frame);
    });
    const doc = frame.contentDocument, win = frame.contentWindow;
    if (!doc || !win) throw new Error("HTML layout inspection is unavailable.");
    return Array.from(doc.querySelectorAll<HTMLElement>("[data-paperlane-layout]"), n => {
      const style = win.getComputedStyle(n);
      return { id: Number(n.dataset.paperlaneLayout), display: style.display, whiteSpace: style.whiteSpace,
        gap: parseFloat(style.columnGap) > 0 || parseFloat(style.rowGap) > 0 };
    });
  } finally { frame.remove(); }
}
