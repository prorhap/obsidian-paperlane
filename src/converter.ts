import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import { defaultSchema, sanitize } from "hast-util-sanitize";
import { toText } from "hast-util-to-text";
import { toHtml } from "hast-util-to-html";
import { visit } from "unist-util-visit";
import { parseDocument } from "yaml";
import type { Element, ElementContent, Root, RootContent, Text } from "hast";
import type { Article, ConvertOptions, Source, Warning } from "./types";
import { bytesToData, imageMime, MAX_ARTICLE, MAX_IMAGE, publicImageUrl, safeLink, sanitizeSvg, validatedDataImage } from "./images";

export const CONVERTER_VERSION = "1";
const txt = (value: string): Text => ({ type: "text", value });
const el = (tagName: string, children: Element["children"], properties: Element["properties"] = {}): Element =>
  ({ type: "element", tagName, properties, children });
type MdNode = { type: string; value?: string; children?: MdNode[]; [k: string]: unknown };
export function normalizedText(value: string): string { return value.normalize("NFKC").replace(/\s+/g, " ").trim(); }
function budget(tree: Root): void {
  let count = 0;
  function check(node: Root | RootContent, depth: number): void {
    if (++count > 50000 || depth > 100) throw new Error("문서 구조가 너무 복잡합니다.");
    if ("children" in node) for (const c of node.children) check(c, depth + 1);
  }
  check(tree, 0);
}
function srcsetCandidate(value: unknown): string {
  const s = String(value || "");
  if (!s || s.startsWith("data:")) return "";
  return s.split(",").map(part => {
    const [url, descriptor] = part.trim().split(/\s+/);
    return { url: url || "", size: parseFloat(descriptor || "0") || 0 };
  }).filter(x => x.url && !/[{}]|%7[bBdD]/.test(x.url))
    .sort((a, b) => b.size - a.size)[0]?.url || "";
}
function actualImageSource(n: Element): string {
  const candidates = [
    n.properties.dataSrc, n.properties.dataOriginal, n.properties.dataLazySrc,
    srcsetCandidate(n.properties.dataSrcset || n.properties.dataSrcSet),
    srcsetCandidate(n.properties.srcSet), n.properties.src,
  ];
  return candidates.map(c => String(c || "")).find(c => c && !/[{}]|%7[bBdD]/.test(c)) || "";
}
function rewriteWiki(node: MdNode): void {
  if (!node.children || ["code", "inlineCode", "html"].includes(node.type)) return;
  node.children = node.children.flatMap((child): MdNode[] => {
    if (child.type !== "text" || !child.value) { rewriteWiki(child); return [child]; }
    const output: MdNode[] = [];
    let last = 0;
    for (const m of child.value.matchAll(/(!)?\[\[([^\]\n]+)\]\]/g)) {
      if (m.index > last) output.push({ type: "text", value: child.value.slice(last, m.index) });
      const [path, alias] = m[2]!.split("|");
      output.push(m[1] ? { type: "image", url: path!, alt: alias && !/^\d+(?:x\d+)?$/.test(alias) ? alias : path! }
        : { type: "text", value: alias || path! });
      last = m.index + m[0].length;
    }
    if (!last) return [child];
    if (last < child.value.length) output.push({ type: "text", value: child.value.slice(last) });
    return output;
  });
}
const imageSchema = {
  ...defaultSchema,
  clobberPrefix: "",
  tagNames: [...defaultSchema.tagNames!, "article", "section", "figure", "figcaption", "span"],
  attributes: {
    ...defaultSchema.attributes,
    "*": ["id"],
    img: ["src", "alt", "title", "width", "height"],
    a: ["href", "title", "id"],
    ol: ["start"],
    td: ["colSpan", "rowSpan"],
    th: ["colSpan", "rowSpan"],
    code: [],
  },
  protocols: { ...defaultSchema.protocols, src: ["https", "data"], href: ["http", "https", "mailto"] },
};

/** Reusable strict sanitizer. IDs are prefixed at conversion time, not on every preview. */
export function cleanHtml(html: string, preview = false): string {
  const tree = unified().use(rehypeParse, { fragment: true }).parse(html);
  budget(tree);
  visit(tree, "element", (n: Element) => {
    if (n.tagName === "img") {
      const src = String(n.properties.src || "");
      const data = validatedDataImage(src);
      if (!data && (!publicImageUrl(src) || preview)) {
        const alt = String(n.properties.alt || "외부 이미지");
        n.tagName = "span";
        n.properties = {};
        n.children = [txt(`[그림: ${alt} — 앱에서 확인]`)];
      } else n.properties.src = data?.src || publicImageUrl(src)!;
    }
    if (n.properties.href && (!safeLink(String(n.properties.href)) || preview)) delete n.properties.href;
  });
  return toHtml(sanitize(tree, imageSchema));
}

export async function convert(source: Source, options: ConvertOptions = {}): Promise<Article> {
  if (Buffer.byteLength(source.text) > 5 * 1024 * 1024) throw new Error("입력 파일은 5 MiB 이하만 지원합니다.");
  const warnings: Warning[] = [];
  const warn = (code: string, message: string, loss = true) => warnings.push({ code, message, loss });
  let title = "";
  let tree: Root;
  if (source.format === "md") {
    let body = source.text;
    const fm = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(body);
    if (fm) {
      try {
        const data = parseDocument(fm[1]!).toJS({ maxAliasCount: 0 }) as Record<string, unknown> | null;
        if (data && typeof data.title === "string") title = data.title;
      } catch { warn("frontmatter", "frontmatter를 읽지 못해 파일명을 제목 후보로 사용합니다.", false); }
      body = body.slice(fm[0].length);
    }
    const processor = unified().use(remarkParse).use(remarkGfm);
    const md = processor.parse(body);
    rewriteWiki(md as unknown as MdNode);
    visit(md, "code", n => {
      if (["mermaid", "dataview", "dataviewjs", "base"].includes(n.lang || "")) {
        warn("dynamic", `${n.lang} 블록은 실행하지 않고 원문 코드로 전송합니다.`);
      }
    });
    const htmlProcessor = unified().use(remarkRehype, { allowDangerousHtml: true, footnoteLabel: "출처와 각주" }).use(rehypeRaw);
    tree = await htmlProcessor.run(md);
  } else {
    tree = unified().use(rehypeParse).parse(source.text);
    budget(tree);
    visit(tree, "element", n => { if (n.tagName === "title" && !title) title = toText(n); });
    const bodies: Element[] = [];
    visit(tree, "element", n => { if (n.tagName === "body") bodies.push(n); });
    tree = { type: "root", children: bodies[0]?.children || tree.children };
    if (!options.wholeBody) {
      const candidates: Element[] = [];
      visit(tree, "element", n => {
        if (n.tagName === "article" || n.tagName === "main") { candidates.push(n); return "skip"; }
      });
      if (candidates.length === 1) tree = { type: "root", children: candidates[0]!.children };
      else if (candidates.length > 1) warn("body", "본문 후보가 여러 개라 전체 본문을 유지합니다.", false);
    }
  }
  budget(tree);
  visit(tree, "element", n => { if (!title && n.tagName === "h1") title = toText(n); });
  title = (options.title || title || source.path.split("/").pop()!.replace(/\.(md|html?)$/i, "")).trim();
  if (!title) throw new Error("문서 제목이 비어 있습니다.");

  const article: Article = { title, html: "", text: "", checkpoints: [], images: [], warnings };
  const inlineSvgs = new Map<string, string>();
  let imageIndex = 0;
  // Remove executable subtrees before sanitization; converting a form must not submit it.
  function normalize(node: Root | Element): void {
    node.children = node.children.flatMap((child): RootContent[] => {
      if (child.type !== "element") return [child];
      const n = child;
      if (["script","iframe","object","embed","canvas","video","audio","form"].includes(n.tagName)) {
        warn("unsupported", `${n.tagName} 요소는 읽기용 문서에서 제외됩니다.`);
        return [el("p", [txt(`[${n.tagName} 콘텐츠 생략]`)])];
      }
      if (["style","link","meta","base","head","template"].includes(n.tagName)) return [];
      if (n.tagName === "svg") {
        const key = `inline-svg-${inlineSvgs.size + 1}`;
        inlineSvgs.set(key, toHtml(n));
        return [el("img", [], { src: key, alt: "SVG 그림" })];
      }
      if (n.tagName === "img") {
        const src = actualImageSource(n);
        if ([n.properties.dataSrc, n.properties.dataSrcset, n.properties.srcSet].some(v => /[{}]|%7[bBdD]/.test(String(v || ""))))
          warn("image-template", "JavaScript용 이미지 주소가 남아 있어 원본 대신 자리 표시자가 선택될 수 있습니다.");
        if (src && src !== String(n.properties.src || ""))
          warn("lazy-image", "지연 로딩 또는 반응형 그림을 실제 이미지 주소로 정리했습니다.", false);
        if (!src) warn("unresolved-image", "JavaScript가 완성해야 하는 이미지 주소이거나 주소가 비어 있습니다.");
        n.properties = { src, alt: String(n.properties.alt || "") };
        return [n];
      }
      if (n.tagName === "source") return [];
      if (n.tagName === "picture") {
        const image = n.children.find((c): c is Element => c.type === "element" && c.tagName === "img");
        const sources = n.children.filter((c): c is Element => c.type === "element" && c.tagName === "source");
        const selected = sources.map(s => srcsetCandidate(s.properties.dataSrcset || s.properties.srcSet)).find(Boolean);
        if (image && selected && !image.properties.dataSrc) image.properties.dataSrc = selected;
        normalize(n); return n.children;
      }
      if (n.tagName === "details") n.tagName = "section";
      if (n.tagName === "summary") n.tagName = "h3";
      if (n.tagName === "input") {
        return [txt(n.properties.checked ? "☑ " : "☐ ")];
      }
      if (n.properties.href && !safeLink(String(n.properties.href))) delete n.properties.href;
      if (n.tagName === "blockquote") {
        const first = n.children.find(c => c.type === "element" && c.tagName === "p");
        if (first?.type === "element" && first.children[0]?.type === "text") {
          const t = first.children[0];
          t.value = t.value.replace(/^\[!([^\]]+)\][+-]?\s*/, "$1: ");
        }
      }
      normalize(n);
      if (n.tagName === "table" && options.tableLists) {
        const rows: Element[] = [];
        visit(n, "element", e => { if (e.tagName === "tr") rows.push(e); });
        const cells = (r: Element) => r.children.filter((c): c is Element => c.type === "element" && ["th","td"].includes(c.tagName));
        const headers = rows[0] && cells(rows[0]).some(c => c.tagName === "th") ? cells(rows.shift()!).map(c => toText(c)) : [];
        return [el("section", rows.map(r => el("ul", cells(r).map((c, i) =>
          el("li", [el("strong", [txt(`${headers[i] || `열 ${i + 1}`}: `)]), ...c.children])))))];
      }
      return [n];
    });
  }
  normalize(tree);
  const imgs: Element[] = [];
  visit(tree, "element", n => { if (n.tagName === "img") imgs.push(n); });
  let totalBytes = 0;
  for (const n of imgs) {
    const original = String(n.properties.src || "");
    const image: Article["images"][number] = { id: `image-${++imageIndex}`, original, alt: String(n.properties.alt || `그림 ${imageIndex}`),
      state: "missing" };
    article.images.push(image);
    try {
      const mapped = options.imageUrls?.get(original);
      if (mapped) {
        const url = publicImageUrl(mapped);
        if (!url) throw new Error("이미지 주소는 공개 HTTPS URL이어야 합니다.");
        image.src = url; image.state = "mapped";
      } else if (publicImageUrl(original)) {
        image.src = publicImageUrl(original)!; image.state = "remote";
      } else {
        const data = validatedDataImage(original);
        let bytes: Uint8Array | undefined = data?.bytes;
        let svg = inlineSvgs.get(original);
        if (!bytes && !svg) {
          if (/^[a-z][a-z0-9+.-]*:/i.test(original) || original.startsWith("//")) throw new Error("지원하지 않는 이미지 주소입니다.");
          const asset = await options.readAsset?.(original, source.path);
          if (!asset) throw new Error("볼트에서 그림 파일을 찾지 못했습니다.");
          if (/\.svg$/i.test(asset.path)) svg = new TextDecoder().decode(asset.bytes);
          else bytes = asset.bytes;
        }
        if (svg) {
          if (!options.rasterizeSvg) throw new Error("SVG를 PNG로 변환할 수 없는 환경입니다.");
          bytes = await options.rasterizeSvg(sanitizeSvg(svg));
          warn("svg-raster", `${image.alt}: SVG를 안전한 정적 PNG로 변환했습니다. 원본과 모양을 확인하세요.`, false);
        }
        if (!bytes || bytes.length > MAX_IMAGE) throw new Error("그림은 파일당 8 MiB 이하여야 합니다.");
        const mime = imageMime(bytes);
        if (!mime) throw new Error("PNG, JPEG, GIF, WebP 또는 정적 SVG만 지원합니다.");
        totalBytes += bytes.length;
        if (totalBytes > MAX_ARTICLE) throw new Error("그림 총 크기가 너무 큽니다.");
        image.src = bytesToData(bytes, mime); image.bytes = bytes.length; image.state = "embedded";
      }
      n.properties = { src: image.src, alt: image.alt };
    } catch (e) {
      warn("image", `${image.alt}: ${e instanceof Error ? e.message : "그림 변환 실패"}`);
      n.tagName = "p"; n.properties = {}; n.children = [txt(`[그림 누락: ${image.alt}]`)];
    }
  }
  if (article.images.some(i => i.state === "embedded"))
    warn("embedded", "그림 데이터가 HTML에 포함됩니다. 전송 후 그림 참조를 확인하며 실제 앱의 오프라인 표시는 별도로 확인해야 합니다.", false);
  if (article.images.some(i => i.state === "remote" || i.state === "mapped"))
    warn("remote", "외부 그림은 Instapaper가 해당 HTTPS 주소에서 가져옵니다. 인증·만료 여부와 오프라인 표시는 앱에서 확인해야 합니다.", false);
  // Stable document-local IDs; keep references and IDs aligned.
  const ids = new Map<string, string>();
  visit(tree, "element", n => { if (n.properties.id) {
    const id = String(n.properties.id);
    const safe = `s2r-${ids.size}-${id.replace(/[^\w-]/g, "-")}`;
    ids.set(id, safe); n.properties.id = safe;
  } });
  visit(tree, "element", n => {
    if (String(n.properties.href || "").startsWith("#")) {
      const target = ids.get(String(n.properties.href).slice(1));
      if (target) n.properties.href = `#${target}`; else delete n.properties.href;
    }
  });
  const sanitized = sanitize(tree, imageSchema);
  if (sanitized.type !== "root") throw new Error("Expected an article root");
  tree = sanitized;
  article.html = String(unified().use(rehypeStringify).stringify({ type: "root", children: [el("article",
    tree.children.filter((n): n is ElementContent => n.type !== "doctype"))] }));
  if (Buffer.byteLength(article.html) > MAX_ARTICLE) throw new Error("변환된 HTML은 24 MiB 이하만 지원합니다.");
  article.text = normalizedText(toText(tree));
  visit(tree, "element", n => {
    if (["p","td","th","pre","li","h1","h2","h3"].includes(n.tagName)) {
      const text = normalizedText(toText(n));
      if (text) article.checkpoints.push(text);
    }
  });
  if (!article.text && !article.images.some(i => i.src)) throw new Error("전송할 정적 본문이나 그림이 없습니다.");
  return article;
}
