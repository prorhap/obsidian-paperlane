import type { Element } from "hast";
import { toText } from "hast-util-to-text";

const element = (tagName: string, children: Element["children"]): Element => ({ type: "element", tagName, properties: {}, children });
const text = (value: string): Element["children"][number] => ({ type: "text", value });
const span = (value: unknown): number => {
  const n = Math.max(1, Math.floor(Number(value) || 1));
  if (!Number.isFinite(n) || n > 1000) throw new Error("Table spans exceed the reading conversion limit.");
  return n;
};

/** Preserve cell relationships even when a reader removes table markup. */
export function readingTable(table: Element): Element {
  const rows: Element[] = [];
  const captions: Element[] = [];
  function collect(n: Element): void {
    for (const c of n.children) {
      if (c.type !== "element") continue;
      if (c.tagName === "tr") rows.push(c);
      else if (c.tagName === "caption") captions.push(c);
      else if (["thead", "tbody", "tfoot"].includes(c.tagName)) collect(c);
    }
  }
  collect(table);
  const headers: string[][] = [];
  const output: Element[] = captions.map(c => element("p", [element("strong", c.children)]));
  let pending = new Map<number, { cell: Element; left: number }>();
  let dataStarted = false;
  let slots = 0;
  for (const row of rows) {
    const cells = row.children.filter((c): c is Element => c.type === "element" && ["td", "th"].includes(c.tagName));
    const isHeader = !dataStarted && cells.length > 0 && cells.every(c => c.tagName === "th");
    if (!isHeader) dataStarted = true;
    const grid = new Map<number, Element>();
    const next = new Map<number, { cell: Element; left: number }>();
    for (const [col, entry] of pending) {
      if (++slots > 100000) throw new Error("Table spans are too complex to convert safely.");
      grid.set(col, entry.cell);
      if (entry.left > 1) next.set(col, { cell: entry.cell, left: entry.left - 1 });
    }
    let col = 0;
    for (const cell of cells) {
      while (grid.has(col)) col++;
      const width = span(cell.properties.colSpan), height = span(cell.properties.rowSpan);
      for (let offset = 0; offset < width; offset++) {
        if (++slots > 100000) throw new Error("Table spans are too complex to convert safely.");
        grid.set(col + offset, cell);
        if (height > 1) next.set(col + offset, { cell, left: height - 1 });
      }
      col += width;
    }
    pending = next;
    if (isHeader) {
      for (const [index, cell] of grid) {
        const label = toText(cell).trim();
        const values = headers[index] ||= [];
        if (label && !values.includes(label)) values.push(label);
      }
      // Header-only tables must not disappear.
      if (rows.every(r => r.children.every(c => c.type !== "element" || c.tagName !== "td")))
        output.push(element("p", cells.flatMap((c, i) => i ? [text(" / "), ...c.children] : c.children)));
      continue;
    }
    const groups = new Map<Element, number[]>();
    for (const [index, cell] of [...grid].sort((a, b) => a[0] - b[0])) groups.set(cell, [...(groups.get(cell) || []), index]);
    output.push(element("ul", [...groups].map(([cell, columns]) => {
      const labels = [...new Set(columns.flatMap(index => headers[index] || []))];
      const label = labels.join(" / ") || `Column ${columns.map(i => i + 1).join("–")}`;
      return element("li", [element("strong", [text(`${label}: `)]), ...structuredClone(cell.children)]);
    })));
  }
  return element("section", output);
}
