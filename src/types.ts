import type { AiPlan, AiSettings } from "./ai";
export type ImageState = "remote" | "embedded" | "mapped" | "missing";
export interface ArticleImage {
  id: string;
  original: string;
  alt: string;
  src?: string;
  state: ImageState;
  bytes?: number;
}
export interface Warning {
  code: string;
  message: string;
  loss: boolean;
}
export interface Article {
  title: string;
  html: string;
  text: string;
  checkpoints: string[];
  tags?: string[];
  images: ArticleImage[];
  warnings: Warning[];
}
export interface Source {
  path: string;
  text: string;
  format: "md" | "html";
}
export interface Asset {
  bytes: Uint8Array;
  path: string;
}
export interface ConvertOptions {
  inspectLayout?: (html: string) => Promise<import("./html-layout").LayoutHint[]>;
  htmlPlan?: AiPlan;
  title?: string;
  wholeBody?: boolean;
  tableLists?: boolean;
  syncTags?: boolean;
  imageUrls?: ReadonlyMap<string, string>;
  readAsset?: (reference: string, sourcePath: string) => Promise<Asset | null>;
  rasterizeSvg?: (svg: string) => Promise<Uint8Array>;
}
export interface Account { id: number; username: string; premium: boolean }
export interface Folder { id: number; title: string; public: boolean }
export interface Bookmark {
  id: number;
  title?: string;
  description?: string;
  private_source?: string;
}
export interface ParsedArticle {
  content: { body: string | null; images?: string[] };
}
export type JobStatus = "submitting" | "unknown" | "saved" | "verified" | "warning" | "failed";
export interface Job {
  id: string;
  accountId: number;
  path: string;
  title: string;
  hash: string;
  started: number;
  status: JobStatus;
  bookmarkId?: number;
  notes: string[];
}
export interface Settings {
  ai?: AiSettings;
  secretId: string;
  credentialSource?: "secret-storage" | "environment";
  envVarName?: string;
  accountId?: number;
  folderId?: number;
  tableLists: boolean;
  syncTags?: boolean;
}
export interface PluginData {
  schema: 1;
  settings: Settings;
  jobs: Job[];
}
