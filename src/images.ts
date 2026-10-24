import { createHash } from "node:crypto";
import type { Element, Root } from "hast";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import { sanitize } from "hast-util-sanitize";
import { toHtml } from "hast-util-to-html";
import { visit } from "unist-util-visit";

export const MAX_IMAGE = 8 * 1024 * 1024;
export const MAX_ARTICLE = 24 * 1024 * 1024;
export function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
export function bytesToData(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}
export function imageMime(b: Uint8Array): string | null {
  if (b.length >= 8 && Buffer.from(b.subarray(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  const head = Buffer.from(b.subarray(0, 12)).toString("ascii");
  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) return "image/gif";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "image/webp";
  return null;
}
export function validatedDataImage(src: string): { src: string; bytes: Uint8Array } | null {
  if (src.length > MAX_IMAGE * 1.4 + 100) return null;
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,([a-zA-Z0-9+/=\s]+)$/.exec(src);
  if (!m) return null;
  const bytes = new Uint8Array(Buffer.from(m[2]!, "base64"));
  if (bytes.length > MAX_IMAGE || imageMime(bytes) !== m[1]) return null;
  return { src: bytesToData(bytes, m[1]!), bytes };
}
export function publicImageUrl(src: string): string | null {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const h = url.hostname.toLowerCase();
    // No local addresses or IP literals, including decimal/hex forms normalized by URL.
    if (!h.includes(".") || /[:[\]]/.test(h) || /^\d+(?:\.\d+){3}$/.test(h)
      || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(h)) return null;
    return url.href;
  } catch { return null; }
}
export function safeLink(src: string): boolean {
  if (src.startsWith("#")) return true;
  try {
    const u = new URL(src);
    return !u.username && !u.password && ["https:", "http:", "mailto:"].includes(u.protocol);
  } catch { return false; }
}

/** Parse without a DOM: no scripts or image/network requests can run here. */
export function sanitizeSvg(input: string): string {
  if (Buffer.byteLength(input) > MAX_IMAGE) throw new Error("SVG 파일이 너무 큽니다.");
  const tree = unified().use(rehypeParse, { fragment: true }).parse(input) as Root;
  const allowed = ["svg","g","path","rect","circle","ellipse","line","polyline","polygon","text","tspan","defs",
    "linearGradient","radialGradient","stop","clipPath","mask","title","desc","use","marker"];
  const clean = sanitize(tree, {
    tagNames: allowed,
    attributes: { "*": ["id","viewBox","width","height","x","y","x1","x2","y1","y2","cx","cy","r","rx","ry",
      "d","points","fill","fillRule","stroke","strokeWidth","strokeLinecap","strokeLinejoin","strokeDasharray",
      "opacity","fillOpacity","strokeOpacity","transform","fontSize","fontFamily","fontWeight","textAnchor",
      "dominantBaseline","offset","stopColor","stopOpacity","gradientUnits","gradientTransform",
      "clipPath","mask","markerStart","markerMid","markerEnd","markerWidth","markerHeight","refX","refY","orient"] },
    clobberPrefix: "",
  }) as Root;
  visit(clean, "element", (n: Element) => {
    for (const [key, value] of Object.entries(n.properties)) {
      const s = String(value);
      // Only local fragment references in SVG presentation properties.
      if (/url\s*\(/i.test(s) && !/^url\(#[\w-]+\)$/.test(s)) delete n.properties[key];
      if (/https?:|data:|javascript:|@import/i.test(s)) delete n.properties[key];
    }
  });
  const svg = clean.children.find((n): n is Element => n.type === "element" && n.tagName === "svg");
  if (!svg) throw new Error("유효한 SVG 그림을 찾지 못했습니다.");
  svg.properties.xmlns = "http://www.w3.org/2000/svg";
  return toHtml(svg);
}
