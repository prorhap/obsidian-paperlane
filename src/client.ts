import type { Account, Article, Bookmark, Folder, ParsedArticle } from "./types";
export interface Response { status: number; json: unknown; headers?: Record<string, string> }
export type Transport = (path: string, method: "GET" | "POST", body?: unknown) => Promise<Response>;
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object";
const validId = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x > 0;
export class InstapaperClient {
  constructor(private transport: Transport) {}
  private async call(path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<unknown> {
    let r: Response;
    try { r = await this.transport(path, method, body); }
    catch { throw new ApiError(0, "The request did not complete. Check the result before retrying."); }
    if (r.status < 200 || r.status >= 300) {
      const messages: Record<number, string> = {
        400: "Check the request and folder. Parsing may be unavailable when retrieving saved content.",
        401: "Check your access token.",
        402: "The external content retrieval limit has been reached.",
        403: "Check your account or application permissions. This error does not necessarily require Premium.",
        429: "The request limit has been reached. Wait, then check the result before retrying.",
      };
      throw new ApiError(r.status, messages[r.status] || `Instapaper error (${r.status}).`);
    }
    return r.json;
  }
  async me(): Promise<Account> {
    const x = await this.call("/me");
    if (!object(x) || !validId(x.id) || typeof x.username !== "string" || typeof x.premium !== "boolean")
      throw new ApiError(0, "Could not validate the account response.");
    return x as unknown as Account;
  }
  async folders(): Promise<Folder[]> {
    const x = await this.call("/folders");
    if (!object(x) || !Array.isArray(x.folders)) throw new ApiError(0, "The folder response is invalid.");
    return x.folders.filter((f): f is Folder => object(f) && validId(f.id)
      && typeof f.title === "string" && typeof f.public === "boolean");
  }
  async save(article: Article, jobId: string, folderId?: number): Promise<Bookmark> {
    const x = await this.call("/bookmarks", "POST", {
      title: article.title, private_source: "Obsidian", content: article.html,
      description: `Obsidian에서 보낸 문서 [s2r:${jobId}]`,
      ...(folderId ? { folder_id: folderId } : {}),
      ...(article.tags?.length ? { tags: article.tags.map(name => ({ name })) } : {}),
    });
    if (!object(x) || !validId(x.id)) throw new ApiError(0, "저장 ID를 확인하지 못했습니다. 재전송 전에 결과 확인이 필요합니다.");
    return x as unknown as Bookmark;
  }
  async parse(id: number): Promise<ParsedArticle> {
    if (!validId(id)) throw new Error("잘못된 저장 ID");
    const x = await this.call(`/bookmarks/${id}/parse`);
    if (!object(x) || !object(x.content) || typeof x.content.body !== "string")
      throw new ApiError(0, "저장된 본문을 확인하지 못했습니다.");
    return x as unknown as ParsedArticle;
  }
  async findJob(jobId: string, since: number): Promise<Bookmark[]> {
    const result: Bookmark[] = [];
    let offset = 0;
    for (let page = 0; page < 20; page++) {
      const x = await this.call(`/bookmarks?since=${Math.max(1, Math.floor(since / 1000) - 300)}&limit=100&offset=${offset}`);
      if (!object(x) || !Array.isArray(x.bookmarks)) throw new ApiError(0, "복구 목록 응답이 올바르지 않습니다.");
      for (const b of x.bookmarks) {
        if (object(b) && validId(b.id) && typeof b.description === "string" && b.description.includes(`[s2r:${jobId}]`))
          result.push(b as unknown as Bookmark);
      }
      const count = x.bookmarks.length + (Array.isArray(x.deleted_ids) ? x.deleted_ids.length : 0);
      offset += count;
      if (count < 100) break;
    }
    return result;
  }
}
