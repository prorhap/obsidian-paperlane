import { cleanHtml } from "./converter";
import type { Article } from "./types";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import { toText } from "hast-util-to-text";
import { toHtml } from "hast-util-to-html";
import type { Element, Root } from "hast";
export const BLOG_CSS = `
:root{color-scheme:light dark;--bg:#f7f5f0;--ink:#252822;--muted:#6d7469;--line:#d8ded3;--accent:#386846}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:18px/1.85 system-ui,-apple-system,sans-serif}
main{max-width:800px;margin:auto;padding:64px 32px 100px}header{border-bottom:1px solid var(--line);margin-bottom:36px}
header p{font-size:12px;letter-spacing:.14em;color:var(--accent)}h1{font-size:2.2em;line-height:1.25;letter-spacing:-.04em}
h2{font-size:1.5em;line-height:1.4;margin:2.5em 0 .8em}h3{margin-top:2em}p{margin:1em 0}
a{color:var(--accent);text-underline-offset:4px}img{display:block;max-width:100%;height:auto;margin:1.8em auto}
figure{margin:2em 0}figcaption{font-size:.85em;color:var(--muted);text-align:center}
blockquote{border-left:3px solid var(--accent);margin:1.6em 0;padding:.2em 1.2em;background:#e8ede5}
pre{background:#20281f;color:#eaf0e7;padding:22px;overflow:auto;border-radius:8px;font-size:.82em;line-height:1.6}
code{font-family:ui-monospace,monospace;overflow-wrap:anywhere}table{display:block;overflow:auto;border-collapse:collapse;font-size:.86em}
th,td{border-bottom:1px solid var(--line);padding:12px 16px;text-align:left;vertical-align:top}th{background:#e8ede5}
li{margin:.3em 0}hr{border:0;border-top:1px solid var(--line);margin:3em 0}footer{margin-top:4em;color:var(--muted);font-size:.8em}
@media(max-width:560px){main{padding:32px 20px 64px}body{font-size:16px}h1{font-size:1.8em}}
@media(prefers-color-scheme:dark){:root{--bg:#191d18;--ink:#e1e5dd;--muted:#a0aa99;--line:#394135;--accent:#a5c89f}blockquote,th{background:#252e22}}
`;
function escape(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]!));
}
export function exportHtml(article: Article): string {
  const tree = unified().use(rehypeParse, { fragment: true }).parse(cleanHtml(article.html)) as Root;
  const root = tree.children.find((n): n is Element => n.type === "element" && n.tagName === "article");
  const first = root?.children.find(n => n.type === "element");
  if (first?.type === "element" && first.tagName === "h1" && toText(first).trim() === article.title.trim()) {
    first.tagName = "span"; first.children = []; // Preserve any anchor ID, avoid duplicate title.
  }
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escape(article.title)}</title><style>${BLOG_CSS}</style></head>
<body><main><header><p>OBSIDIAN · READING COPY</p><h1>${escape(article.title)}</h1></header>
${toHtml(tree)}<footer>Send2Reader for Instapaper · 읽기용 사본</footer></main></body></html>`;
}
