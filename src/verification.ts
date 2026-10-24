import { unified } from "unified";
import rehypeParse from "rehype-parse";
import { toText } from "hast-util-to-text";
import { visit } from "unist-util-visit";
import type { Root } from "hast";
import type { Article, ParsedArticle } from "./types";
import { normalizedText } from "./converter";
import { validatedDataImage, hash } from "./images";

/** Reference retention is not proof of image download, app display, or offline caching. */
export function verify(article: Article, parsed: ParsedArticle): string[] {
  const notes: string[] = [];
  const tree = unified().use(rehypeParse, { fragment: true }).parse(parsed.content.body || "") as Root;
  const text = normalizedText(toText(tree));
  const missed = article.checkpoints.filter(c => !text.includes(c));
  if (missed.length) notes.push(`본문 ${missed.length}개 구간을 원문과 동일하게 확인하지 못했습니다.`);
  if (article.text && !text) notes.push("저장된 본문이 비어 있습니다.");
  // Inspect actual HTML img nodes, not just the parser's side-list of image URLs.
  const actual: string[] = [];
  visit(tree, "element", n => { if (n.tagName === "img") actual.push(String(n.properties.src || "")); });
  const key = (src: string) => {
    const data = validatedDataImage(src);
    return data ? `data:${hash(data.bytes)}` : src;
  };
  const counts = new Map<string, number>();
  for (const src of actual) counts.set(key(src), (counts.get(key(src)) || 0) + 1);
  for (const image of article.images) {
    if (!image.src) { notes.push(`${image.alt}: 전송 전부터 그림이 누락되어 있습니다.`); continue; }
    const k = key(image.src), count = counts.get(k) || 0;
    if (count) counts.set(k, count - 1);
    else notes.push(`${image.alt}: 그림 참조를 확인하지 못했습니다. 누락되었거나 서버가 주소를 변경했을 수 있습니다.`);
  }
  return notes;
}
