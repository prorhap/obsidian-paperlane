import helperSource from "../helper/server.py";
import { defaultAi, loadAi, PROVIDERS, review, REVIEW_INSTRUCTIONS, type AiPlan, type AiProvider } from "./ai";
import { reviewDocument, validatePlan, describePlan } from "./html-review";
import { Plugin, PluginSettingTab, Setting, type SettingDefinitionItem, SecretComponent, App, Modal, Notice, TFile, TFolder, MarkdownView,
  FuzzySuggestModal, requestUrl, normalizePath, sanitizeHTMLToDom } from "obsidian";
import { assertVaultEntry, assertVaultRelativePath } from "./vault-boundary";
import type { Account, Article, Folder, Job, PluginData, Source } from "./types";
import { convert, cleanHtml } from "./converter";
import { InstapaperClient } from "./client";
import { SendCoordinator } from "./workflow";
import { sendFeedback } from "./send-feedback";
import { exportHtml } from "./template";
import { MAX_IMAGE } from "./images";
import { DEFAULT_ENV_NAME, resolveToken } from "./credentials";
import { env } from "node:process";

const defaults = (): PluginData => ({ schema: 1, settings: {
  ai: defaultAi(), secretId: "", credentialSource: "secret-storage", envVarName: DEFAULT_ENV_NAME, tableLists: false, syncTags: false,
}, jobs: [] });
const supported = (f: TFile) => /^(md|html|htm)$/i.test(f.extension);
const label: Record<Job["status"], string> = { submitting: "전송 중", unknown: "결과 확인 필요", saved: "저장됨",
  verified: "본문과 그림 참조 확인", warning: "저장됨 · 확인 필요", failed: "전송 실패" };
const message = (e: unknown) => e instanceof Error ? e.message : "Could not complete the operation.";

export default class Paperlane extends Plugin {
  data: PluginData = defaults();
  coordinator!: SendCoordinator;
  connection?: Account;
  folders: Folder[] = [];
  private writes = Promise.resolve();
  private aiBusy = false;
  async onload(): Promise<void> {
    const loaded: unknown = await this.loadData();
    if (loaded) {
      const x = loaded as PluginData;
      if (x.schema !== 1 || !x.settings || typeof x.settings.secretId !== "string" || !Array.isArray(x.jobs)
        || x.jobs.some(j => !j || typeof j.id !== "string" || !Number.isSafeInteger(j.accountId)
          || typeof j.path !== "string" || typeof j.hash !== "string" || !Array.isArray(j.notes) || !(j.status in label))) {
        new Notice("Paperlane 이력 형식이 올바르지 않습니다. 파일을 보존하고 플러그인 로드를 중단했습니다.", 10000);
        throw new Error("Invalid Paperlane journal");
      }
      this.data = x;
      this.data.settings.credentialSource ??= "secret-storage";
      this.data.settings.envVarName ??= DEFAULT_ENV_NAME;
      this.data.settings.syncTags = this.data.settings.syncTags === true;
    }
    this.data.settings.ai = loadAi(this.data.settings.ai);
    for (const j of this.data.jobs) if (j.status === "submitting") j.status = "unknown";
    this.coordinator = new SendCoordinator({ jobs: this.data.jobs, flush: () => this.persist() });
    await this.persist();
    this.addSettingTab(new SendSettings(this.app, this));
    this.addCommand({ id: "send-current", name: "Send current note to Instapaper", checkCallback: checking => {
      const file = this.app.workspace.getActiveFile();
      if (!file || !supported(file)) return false;
      if (!checking) void this.openPreview(file);
      return true;
    } });
    this.addCommand({ id: "choose-file", name: "보낼 Markdown 또는 HTML 파일 선택", callback: () => new FilePicker(this.app, this).open() });
    this.addCommand({ id: "history", name: "전송 이력과 결과 확인", callback: () => new HistoryModal(this.app, this).open() });
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (file instanceof TFile && supported(file)) menu.addItem(item => item.setTitle("Send to Instapaper")
        .setIcon("send").onClick(() => { void this.openPreview(file); }));
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      for (const job of this.data.jobs) if (job.path === oldPath) job.path = file.path;
      void this.persist().catch(() => new Notice("이름 변경 이력 저장 실패"));
    }));
  }
  persist(): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(this.data)) as PluginData;
    const operation = this.writes.catch(() => {}).then(() => this.saveData(snapshot));
    this.writes = operation;
    return operation;
  }
  client(): InstapaperClient {
    const token = resolveToken(this.data.settings, env, id => this.app.secretStorage.getSecret(id));
    return new InstapaperClient(async (path, method, body) => {
      if (!path.startsWith("/") || path.includes("://")) throw new Error("Invalid API path");
      const operation = requestUrl({ url: `https://www.instapaper.com/api/2${path}`, method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body), throw: false });
      let timer: number | undefined;
      try {
        const response = method === "GET" ? await Promise.race([operation, new Promise<never>((_, reject) => {
          timer = window.setTimeout(() => reject(new Error("Request timed out")), 20000);
        })]) : await operation;
        let json: unknown;
        try { json = JSON.parse(response.text); } catch { json = null; }
        return { status: response.status, json, headers: response.headers };
      } finally { if (timer !== undefined) window.clearTimeout(timer); }
    });
  }
  async connect(): Promise<void> {
    const client = this.client();
    const account = await client.me();
    if (this.data.settings.accountId !== account.id) this.data.settings.folderId = undefined;
    this.data.settings.accountId = account.id;
    this.connection = account;
    this.folders = (await client.folders()).filter(f => !f.public);
    await this.persist();
  }
  async reviewHtml(html: string): Promise<AiPlan> {
    if (this.aiBusy) throw new Error("Another AI request is running. Please wait.");
    const ai = loadAi(this.data.settings.ai);
    if (ai.provider === "off") throw new Error("Choose an AI provider in Paperlane settings first.");
    const config = ai.configs[ai.provider];
    const token = config.secretId ? this.app.secretStorage.getSecret(config.secretId) : null;
    if (!token) throw new Error("Link an API key or helper token in Paperlane AI settings.");
    const document = reviewDocument(html);
    this.aiBusy = true;
    try {
      const plan = await review(ai.provider, config, token, document, async request => {
        let timer: number | undefined;
        try {
          const response = await Promise.race([
            requestUrl({ url: request.url, method: "POST", headers: request.headers, body: request.body, throw: false }),
            new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error("AI timeout")), 120000); }),
          ]);
          if (response.text.length > 200000) throw new Error("AI response too large");
          let json: unknown;
          try { json = JSON.parse(response.text); } catch { json = null; }
          return { status: response.status, json };
        } finally { if (timer !== undefined) window.clearTimeout(timer); }
      });
      validatePlan(html, plan);
      return plan;
    } finally { this.aiBusy = false; }
  }
  async exportHelper(): Promise<void> {
    const folder = "Paperlane Helper";
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const destination = this.app.vault.getFolderByPath(folder);
    if (!destination) throw new Error("The helper folder is unavailable.");
    this.requireVaultEntry(destination);
    const files = { "paperlane-helper.py": helperSource, "review-protocol.json": JSON.stringify({ instructions: REVIEW_INSTRUCTIONS }, null, 2) };
    for (const [name, contents] of Object.entries(files)) {
      const path = `${folder}/${name}`;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) { this.requireVaultEntry(file); await this.app.vault.modify(file, contents); }
      else if (!file) await this.app.vault.create(path, contents);
      else throw new Error("A folder conflicts with the helper file name.");
    }
    new Notice("Helper files saved in Paperlane Helper. No credentials were exported.", 8000);
  }
  private requireVaultEntry(file: TFile | TFolder): void {
    assertVaultEntry(file, this.app.vault, path => this.app.vault.getAbstractFileByPath(path));
  }
  async source(file: TFile): Promise<Source> {
    this.requireVaultEntry(file);
    if (file.stat.size > 5 * 1024 * 1024) throw new Error("5 MiB 이하의 문서를 선택하세요.");
    const views = this.app.workspace.getLeavesOfType("markdown").map(l => l.view)
      .filter((v): v is MarkdownView => v instanceof MarkdownView && v.file?.path === file.path);
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = active?.file?.path === file.path ? active : views[0];
    const text = editor ? editor.editor.getValue() : await this.app.vault.read(file);
    return { path: file.path, format: file.extension.toLowerCase() === "md" ? "md" : "html", text };
  }
  async readAsset(reference: string, sourcePath: string): Promise<{ path: string; bytes: Uint8Array } | null> {
    let ref: string;
    try { ref = decodeURIComponent(reference.split("#")[0]!); } catch { return null; }
    if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(ref) || ref.startsWith("/") || ref.includes("\0")) return null;
    const file = this.app.metadataCache.getFirstLinkpathDest(ref, sourcePath);
    if (!(file instanceof TFile)) return null;
    this.requireVaultEntry(file);
    if (file.stat.size > MAX_IMAGE) throw new Error("그림 파일은 8 MiB 이하여야 합니다.");
    return { path: file.path, bytes: new Uint8Array(await this.app.vault.readBinary(file)) };
  }
  async openPreview(file: TFile): Promise<void> {
    try {
      const source = await this.source(file);
      if ((this.data.settings.credentialSource === "environment" || this.data.settings.secretId) && !this.connection) {
        try { await this.connect(); } catch { new Notice("연결하지 못했습니다. HTML 미리보기와 내보내기는 가능합니다."); }
      }
      new PreviewModal(this.app, this, source).open();
    } catch (e) { new Notice(message(e), 8000); }
  }
  async export(article: Article): Promise<string> {
    const folder = "Paperlane Exports";
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const destination = this.app.vault.getFolderByPath(folder);
    if (!destination) throw new Error("내보내기 폴더를 확인하세요.");
    this.requireVaultEntry(destination);
    const name = article.title.replace(/[*?"<>|:\\/]/g, "-").slice(0, 100) || "article";
    const path = normalizePath(`${folder}/${name}-${Date.now()}.html`);
    assertVaultRelativePath(path);
    await this.app.vault.create(path, exportHtml(article));
    return path;
  }
}

class FilePicker extends FuzzySuggestModal<TFile | TFolder> {
  constructor(app: App, private plugin: Paperlane, private folder: TFolder = app.vault.getRoot()) {
    super(app);
    this.setPlaceholder(`${folder.path || "/"} — 폴더 또는 Markdown/HTML 파일 선택`);
  }
  getItems(): (TFile | TFolder)[] {
    // Inspect only this folder's immediate children; never enumerate the whole vault.
    return [
      ...(this.folder.parent ? [this.folder.parent] : []),
      ...this.folder.children.filter((f): f is TFile | TFolder =>
        f instanceof TFolder || (f instanceof TFile && supported(f))),
    ];
  }
  getItemText(item: TFile | TFolder): string {
    return item === this.folder.parent ? "../" : item instanceof TFolder ? `${item.name}/` : item.name;
  }
  onChooseItem(item: TFile | TFolder): void {
    if (item instanceof TFolder) new FilePicker(this.app, this.plugin, item).open();
    else void this.plugin.openPreview(item);
  }
}

class SendSettings extends PluginSettingTab {
  constructor(app: App, private plugin: Paperlane) { super(app, plugin); }
  getSettingDefinitions(): SettingDefinitionItem[] {
    const settings = this.plugin.data.settings;
    const ai = settings.ai ??= defaultAi();
    const provider = ai.provider === "off" ? "bedrock" : ai.provider;
    const config = ai.configs[provider];
    const resetConnection = () => {
      this.plugin.connection = undefined; this.plugin.folders = [];
      settings.accountId = undefined; settings.folderId = undefined;
    };
    return [
      { name: "Instapaper connection", desc: "Use the token issued with Generate access token in your Instapaper application." },
      { name: "Token source", aliases: ["token", "credentials", "environment"], render: row => {
        row.addDropdown(d => d.addOption("secret-storage", "Obsidian secret storage").addOption("environment", "Environment variable")
          .setValue(settings.credentialSource ?? "secret-storage").onChange(async value => {
            settings.credentialSource = value === "environment" ? "environment" : "secret-storage";
            resetConnection(); await this.plugin.persist(); this.update();
          }));
      } },
      { name: "Environment variable name", aliases: ["environment variable"],
        desc: "Only the variable name is saved. The token is read from the environment used to launch Obsidian.",
        visible: () => settings.credentialSource === "environment", render: row => {
          row.addText(t => t.setPlaceholder(DEFAULT_ENV_NAME).setValue(settings.envVarName ?? DEFAULT_ENV_NAME)
            .onChange(async name => { settings.envVarName = name.trim(); resetConnection(); await this.plugin.persist(); }));
        } },
      { name: "Personal access token", aliases: ["access token", "secret storage"], desc: "Select an entry from Obsidian secret storage.",
        visible: () => settings.credentialSource !== "environment", render: row => {
          new SecretComponent(this.app, row.controlEl).setValue(settings.secretId).onChange(async id => {
            settings.secretId = id || ""; resetConnection(); await this.plugin.persist();
          });
        } },
      { name: "Check connection", aliases: ["connection", "account"], desc: this.plugin.connection
        ? `${this.plugin.connection.username} · ${this.plugin.connection.premium ? "Premium" : "Free account"}`
        : "Look up your account and existing folders without sending a test article.", render: row => {
          row.addButton(b => b.setButtonText("Check connection").onClick(async () => {
            b.setDisabled(true);
            try { await this.plugin.connect(); this.update(); } catch (e) { new Notice(message(e), 8000); }
            finally { b.setDisabled(false); }
          }));
        } },
      { name: "Default folder", aliases: ["folder", "destination"], render: row => {
        row.addDropdown(d => {
          d.addOption("", "Home");
          for (const f of this.plugin.folders) d.addOption(String(f.id), f.title);
          d.setValue(String(settings.folderId || "")).onChange(async value => {
            settings.folderId = value ? Number(value) : undefined; await this.plugin.persist();
          });
        });
      } },
      { name: "Sync tags", aliases: ["tags", "태그", "Instapaper"],
        desc: "Include Markdown frontmatter and inline tags when sending. Categories are excluded. Existing bookmarks are not updated automatically.", render: row => {
          row.addToggle(t => t.setValue(settings.syncTags === true).onChange(async value => {
            settings.syncTags = value; await this.plugin.persist();
          }));
        } },
      { name: "Convert wide tables to lists", aliases: ["table", "list"], render: row => {
        row.addToggle(t => t.setValue(settings.tableLists).onChange(async value => {
          settings.tableLists = value; await this.plugin.persist();
        }));
      } },
      { name: "Disconnect", aliases: ["disconnect"], desc: "Clear the selected secret and connection. This does not delete environment variables or revoke your Instapaper token.", render: row => {
        row.addButton(b => b.setButtonText("Disconnect").onClick(async () => {
          settings.secretId = ""; settings.credentialSource = "secret-storage"; resetConnection();
          await this.plugin.persist(); this.update();
        }));
      } },
      { name: "AI assistance", desc: "Optional HTML review. Nothing is uploaded until you click Review with AI in the preview. API usage may incur charges.", render: row => {
        row.addDropdown(d => {
          d.addOption("off", "Off — local conversion only");
          for (const [id, title] of Object.entries(PROVIDERS)) d.addOption(id, title);
          d.setValue(ai.provider).onChange(async value => {
            ai.provider = value as typeof ai.provider; await this.plugin.persist(); this.update();
          });
        });
      } },
      { name: provider === "profile" ? "Helper token" : "AI API key", visible: () => ai.provider !== "off",
        desc: "Use Link to select or add a secret. This is separate from your Instapaper token.", render: row => {
          new SecretComponent(this.app, row.controlEl).setValue(config.secretId).onChange(async id => {
            config.secretId = id || ""; await this.plugin.persist();
          });
        } },
      { name: "AWS profile", visible: () => ai.provider === "profile", desc: "Your local AWS profile name. GPT-6 Astra (low) is selected automatically.", render: row => {
        row.addText(t => t.setPlaceholder("default").setValue(config.profile).onChange(async value => {
          config.profile = value.trim() || "default"; await this.plugin.persist();
        }));
      } },
      { name: "Local helper setup", visible: () => ai.provider === "profile",
        desc: "One-time setup keeps AWS credentials outside Obsidian. The helper runs only while its terminal is open.", render: row => {
          row.addButton(b => b.setButtonText("Setup instructions").onClick(() => new HelperSetupModal(this.app, this.plugin).open()));
        } },
      { name: "Model", visible: () => ai.provider !== "off",
        desc: provider === "profile" ? "GPT-6 Astra · low reasoning · global cross-region inference" : `${config.model} · selected for structured document review`, render: row => {
          const details = row.controlEl.createEl("details", { cls: "s2r-ai-advanced" });
          details.createEl("summary", { text: "Advanced" });
          if (provider !== "profile") new Setting(details).setName("Model ID").addText(t => t.setValue(config.model).onChange(async value => {
            config.model = value.trim(); await this.plugin.persist();
          }));
          if (["bedrock", "profile"].includes(provider)) new Setting(details).setName("AWS region").setDesc("Choose a region where your account can access the selected model.")
            .addText(t => t.setValue(config.region).onChange(async value => { config.region = value.trim(); await this.plugin.persist(); }));
          new Setting(details).setName("Restore defaults").addButton(b => b.setButtonText("Reset model and region").onClick(async () => {
            const defaults = defaultAi().configs[provider]; config.model = defaults.model; config.region = defaults.region;
            await this.plugin.persist(); this.update();
          }));
        } },
      { name: "Test AI connection", visible: () => ai.provider !== "off",
        desc: "Send a tiny sample, not a vault note. A small API charge may apply.", render: row => {
          const status = row.descEl.createDiv({ attr: { role: "status", "aria-live": "polite" } });
          row.addButton(b => b.setButtonText("Test connection").onClick(async () => {
            b.setDisabled(true).setButtonText("Testing…"); status.setText("Checking model access…");
            try { await this.plugin.reviewHtml("<html><body><div>A short test paragraph.</div></body></html>"); status.setText("Connected. Ready for HTML review."); }
            catch (e) { status.setText(message(e)); }
            finally { b.setDisabled(false).setButtonText("Test connection"); }
          }));
        } },
      { name: "Image support", desc: "Embedded PNG saving and web display have been verified with a free account. Other formats, large images, and mobile offline display require separate checks." },
    ];
  }
}

class HelperSetupModal extends Modal {
  constructor(app: App, private plugin: Paperlane) { super(app); }
  onOpen(): void {
    this.contentEl.createEl("h2", { text: "Connect your AWS profile" });
    this.contentEl.createEl("p", { text: "Export the helper, then run it in a terminal. It reads your AWS profile and sends review requests to Bedrock using GPT-6 Astra with low reasoning. AWS credentials stay in the helper process." });
    new Setting(this.contentEl).setName("1. Save helper files in your vault").addButton(b => b.setButtonText("Export helper").onClick(async () => {
      try { await this.plugin.exportHelper(); b.setButtonText("Exported"); } catch (e) { new Notice(message(e)); }
    }));
    this.contentEl.createEl("p", { text: "2. Open a terminal in the exported Paperlane Helper folder and run:" });
    this.contentEl.createEl("pre", { text: 'python3 -m venv "$HOME/.local/share/paperlane/venv"\n"$HOME/.local/share/paperlane/venv/bin/pip" install boto3\n"$HOME/.local/share/paperlane/venv/bin/python" paperlane-helper.py' });
    this.contentEl.createEl("p", { text: "3. In AI settings, link the Helper token printed in the terminal using Add secret. Enter your profile name and click Test connection. If you use AWS SSO, sign in first with aws sso login --profile YOUR_PROFILE." });
    this.contentEl.createEl("p", { text: "Keep the terminal open while reviewing. The pairing token is stored outside your vault and reused on restart. Ctrl+C stops the helper. No background service is installed." });
  }
}

/** SVG has already been reduced to a static, external-resource-free subset. */
export async function rasterizeSvg(svg: string): Promise<Uint8Array> {
  const blob = new Blob([svg], { type: "image/svg+xml" }), url = URL.createObjectURL(blob);
  try {
    const img = createEl("img");
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("SVG 변환 시간 초과")), 5000);
      img.onload = () => { window.clearTimeout(timeout); resolve(); };
      img.onerror = () => { window.clearTimeout(timeout); reject(new Error("SVG를 읽지 못했습니다.")); };
      img.src = url;
    });
    const width = img.naturalWidth || 1200, height = img.naturalHeight || 800;
    if (width * height > 16000000 || width > 8000 || height > 8000) throw new Error("SVG 해상도가 너무 큽니다.");
    const canvas = createEl("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("그림 변환을 지원하지 않습니다.");
    ctx.drawImage(img, 0, 0);
    const result = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG 변환 실패")), "image/png"));
    return new Uint8Array(await result.arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
}

class PreviewModal extends Modal {
  private article?: Article;
  private title = "";
  private wholeBody = true;
  private aiPlan?: AiPlan;
  private aiApplied = false;
  private reviewing = false;
  private aiNotice = "";
  private imageUrls = new Map<string, string>();
  private allowLoss = false;
  private generation = 0;
  private sending = false;
  private accountId?: number;
  private folderId?: number;
  private syncTags: boolean;
  constructor(app: App, private plugin: Paperlane, private source: Source) {
    super(app); this.accountId = plugin.connection?.id; this.folderId = plugin.data.settings.folderId;
    this.syncTags = plugin.data.settings.syncTags === true;
  }
  onOpen(): void { this.modalEl.addClass("s2r-modal"); void this.rebuild(); }
  onClose(): void { this.generation++; this.contentEl.empty(); }
  private async rebuild(): Promise<void> {
    if (this.sending || this.reviewing) return;
    this.allowLoss = false;
    const gen = ++this.generation;
    this.contentEl.empty(); this.contentEl.createEl("p", { text: "문서와 그림을 준비하고 있습니다…" });
    try {
      const article = await convert(this.source, {
        htmlPlan: this.aiApplied ? this.aiPlan : undefined, title: this.title, wholeBody: this.wholeBody, syncTags: this.syncTags, tableLists: this.plugin.data.settings.tableLists,
        imageUrls: this.imageUrls, readAsset: (r, p) => this.plugin.readAsset(r, p), rasterizeSvg,
      });
      if (gen !== this.generation) return;
      this.article = article; this.render();
    } catch (e) {
      if (gen === this.generation) { this.contentEl.empty(); this.contentEl.createEl("p", { text: message(e) }); }
    }
  }
  private render(): void {
    const article = this.article!; const el = this.contentEl; el.empty();
    el.createEl("p", { text: "PAPERLANE / 읽기용 사본", cls: "s2r-kicker" });
    el.createEl("h2", { text: "Send to Instapaper" });
    el.createEl("p", { text: `${this.source.path} · ${this.plugin.connection?.username || "계정 연결 전"}`, cls: "s2r-muted" });
    new Setting(el).setName("제목").addText(t => t.setValue(article.title).onChange(v => { this.title = v; }));
    new Setting(el).setName("저장 위치").addDropdown(d => {
      d.addOption("", "홈");
      for (const f of this.plugin.folders) d.addOption(String(f.id), f.title);
      d.setValue(String(this.folderId || "")).onChange(v => { this.folderId = v ? Number(v) : undefined; });
    });
    if (this.source.format === "html") new Setting(el).setName("HTML 전체 본문 사용")
      .setDesc("끄면 article 또는 main이 하나일 때 해당 본문을 사용합니다.")
      .addToggle(t => t.setValue(this.wholeBody).onChange(v => { this.wholeBody = v; void this.rebuild(); }));
    if (this.source.format === "html") {
      const ai = loadAi(this.plugin.data.settings.ai);
      const box = el.createDiv({ cls: "s2r-warnings" });
      box.createEl("strong", { text: "AI review" });
      box.createEl("p", { text: ai.provider === "off" ? "Choose a provider in Paperlane settings to enable optional AI review. Local conversion is available without it."
        : `Send this document's static text and structure to ${PROVIDERS[ai.provider]} for review. Images, scripts, and other vault notes are excluded. API charges may apply. This is not visual or factual verification.` });
      if (this.aiNotice) box.createEl("p", { text: this.aiNotice, attr: { role: "status" } });
      if (ai.provider !== "off") new Setting(box).addButton(b => b.setButtonText(this.reviewing ? "Reviewing…" : "Review with AI").setDisabled(this.reviewing || this.sending).onClick(async () => {
        if (this.reviewing || this.sending) return;
        const generation = this.generation;
        this.reviewing = true; this.aiNotice = "Reviewing text and structure…"; this.render();
        try {
          const plan = await this.plugin.reviewHtml(this.source.text);
          if (generation !== this.generation) return;
          this.aiPlan = plan; this.aiApplied = false;
          this.aiNotice = `Review complete: ${plan.changes.length} proposed formatting changes. Review the findings before applying.`;
        } catch (e) { if (generation === this.generation) this.aiNotice = message(e); }
        finally { this.reviewing = false; if (generation === this.generation) await this.rebuild(); }
      }));
      if (this.aiPlan) {
        box.createEl("p", { text: "Model observations (not independently verified)" });
        const findings = box.createEl("ul");
        for (const finding of this.aiPlan.findings) findings.createEl("li", { text: finding });
        for (const description of describePlan(this.source.text, this.aiPlan)) findings.createEl("li", { text: description });
        new Setting(box).setName(this.aiApplied ? "Formatting applied" : "Apply suggested formatting").setDesc("Uses original text only. Inspect the updated preview before sending.")
          .addButton(b => b.setButtonText(this.aiApplied ? "Use local conversion" : "Apply and preview").setDisabled(this.reviewing || this.sending).onClick(() => {
            this.aiApplied = !this.aiApplied; void this.rebuild();
          }));
      }
    }
    new Setting(el).setName("Tags").setDesc(this.syncTags
      ? article.tags?.length ? article.tags.map(tag => `#${tag}`).join(" ") : "No Markdown tags found."
      : "Tag sync is off. Enable Sync tags in Paperlane settings to include tags.");
    const imageSection = el.createEl("details", { cls: "s2r-images" });
    imageSection.createEl("summary", { text: `그림 ${article.images.length}개 · 내장 ${article.images.filter(i => i.state === "embedded").length} · 누락 ${article.images.filter(i => i.state === "missing").length}` });
    for (const image of article.images) {
      const row = imageSection.createDiv({ cls: "s2r-image-row" });
      row.createEl("strong", { text: image.alt });
      row.createSpan({ text: ({ remote: "HTTPS 이미지", mapped: "지정한 HTTPS 이미지", embedded: "HTML에 내장", missing: "그림 누락" })[image.state] });
      const input = row.createEl("input", { type: "url", placeholder: "선택 사항: 이 그림의 공개 HTTPS URL" });
      input.value = this.imageUrls.get(image.original) || "";
      input.addEventListener("change", () => {
        this.imageUrls.set(image.original, input.value.trim());
        this.allowLoss = false;
      });
    }
    if (article.images.length) new Setting(el).setName("그림 주소 변경 적용").addButton(b => b.setButtonText("미리보기 갱신").onClick(() => { void this.rebuild(); }));
    if (article.warnings.length) {
      const box = el.createDiv({ cls: "s2r-warnings" });
      box.createEl("strong", { text: "변환 확인 사항" });
      const list = box.createEl("ul");
      for (const warning of article.warnings) list.createEl("li", { text: warning.message });
    }
    if (article.warnings.some(w => w.loss)) new Setting(el).setName("위 누락과 변환 손실을 확인했습니다")
      .addToggle(t => t.setValue(this.allowLoss).onChange(v => { this.allowLoss = v; }));
    const preview = el.createDiv({ cls: "s2r-article" });
    // Apply our article/asset policy first, then Obsidian's DOM sanitizer.
    preview.appendChild(sanitizeHTMLToDom(cleanHtml(article.html, true)));
    preview.addEventListener("click", e => { if ((e.target as Element).closest("a")) e.preventDefault(); });
    el.createEl("p", { text: "이 화면은 로컬 미리보기입니다. Instapaper의 글꼴과 배치는 달라질 수 있습니다.", cls: "s2r-muted" });
    const status = el.createDiv({ cls: "s2r-status", attr: { role: "status", "aria-live": "polite" } });
    const actions = new Setting(el);
    actions.addButton(b => b.setButtonText("읽기용 HTML 내보내기").onClick(async () => {
      try {
        const output = await this.currentArticle();
        const path = await this.plugin.export(output);
        status.setText(`저장: ${path}`);
      } catch (e) { status.setText(message(e)); }
    }));
    let nextAction: "send" | "done" | "history" = "send";
    actions.addButton(b => b.setButtonText("Send to Instapaper").setCta().onClick(async () => {
      if (nextAction === "done") { this.close(); return; }
      if (nextAction === "history") { this.close(); new HistoryModal(this.app, this.plugin).open(); return; }
      if (this.sending || this.reviewing) return;
      b.setDisabled(true).setButtonText("Sending…"); this.sending = true;
      const started = Date.now();
      status.setAttribute("aria-busy", "true");
      status.setAttribute("data-state", "sending");
      status.setText("Saving your article and checking the result…");
      const showResult = (job: Pick<Job, "status" | "bookmarkId" | "notes">) => {
        const feedback = sendFeedback(job);
        status.setAttribute("data-state", feedback.kind);
        status.setText(`${feedback.title}\n${job.notes.join("\n")}`);
        nextAction = feedback.action === "retry" ? "send" : feedback.action;
        b.setButtonText(feedback.action === "done" ? "Done" : feedback.action === "history" ? "View history" : "Try again");
        new Notice(feedback.title, feedback.kind === "success" ? 5000 : 10000);
        status.scrollIntoView({ block: "nearest" });
      };
      try {
        if (!this.accountId) throw new Error("설정에서 계정을 연결한 뒤 미리보기를 다시 여세요.");
        if (article.warnings.some(w => w.loss) && !this.allowLoss) throw new Error("누락되는 내용을 먼저 확인하세요.");
        // The preview is an immutable snapshot. A changed file needs a refreshed preview.
        const file = this.app.vault.getAbstractFileByPath(this.source.path);
        if (!(file instanceof TFile) || (await this.plugin.source(file)).text !== this.source.text)
          throw new Error("원본 문서가 변경되었습니다. 미리보기를 닫고 다시 실행하세요.");
        const output = await this.currentArticle();

        const job = await this.plugin.coordinator.send(this.plugin.client(), this.accountId, this.source.path, output, this.folderId);
        showResult(job);
      } catch (e) {
        const saved = [...this.plugin.data.jobs].reverse().find(job => job.path === this.source.path
          && job.accountId === this.accountId && job.started >= started && job.bookmarkId);
        if (saved) {
          showResult({ ...saved, status: "warning", notes: [message(e)] });
        } else if (this.plugin.data.jobs.some(job => job.path === this.source.path
          && job.accountId === this.accountId && ["unknown", "submitting"].includes(job.status))) {
          showResult({ status: "unknown", notes: [message(e)] });
        } else {
          status.setAttribute("data-state", "error");
          status.setText(message(e));
          b.setButtonText("Send to Instapaper");
          new Notice(message(e), 8000);
        }
      } finally {
        status.setAttribute("aria-busy", "false");
        this.sending = false; b.setDisabled(false);
      }
    }));
  }
  private async currentArticle(): Promise<Article> {
    if (this.syncTags !== (this.plugin.data.settings.syncTags === true))
      throw new Error("Tag sync settings changed. Close and reopen the preview before sending.");
    if (this.reviewing) throw new Error("Wait for the AI review to finish.");
    const title = this.title.trim() || this.article!.title;
    // Image mapping edits require preview refresh; send exactly the shown HTML.
    return { ...this.article!, title };
  }
}

class HistoryModal extends Modal {
  constructor(app: App, private plugin: Paperlane) { super(app); }
  onOpen(): void { this.render(); }
  private render(): void {
    this.contentEl.empty(); this.contentEl.createEl("h2", { text: "전송 이력" });
    this.contentEl.createEl("p", { text: "저장 성공과 실제 앱의 그림 표시는 다릅니다. 불명확한 전송은 먼저 결과를 조회하세요." });
    if (!this.plugin.data.jobs.length) this.contentEl.createEl("p", { text: "아직 전송한 문서가 없습니다." });
    for (const job of [...this.plugin.data.jobs].reverse().slice(0, 100)) {
      const row = this.contentEl.createDiv({ cls: "s2r-history" });
      row.createEl("h3", { text: job.title });
      row.createEl("p", { text: `${label[job.status]} · ${new Date(job.started).toLocaleString()}${job.bookmarkId ? ` · ID ${job.bookmarkId}` : ""}` });
      row.createEl("p", { text: job.notes.join("\n") });
      new Setting(row).addButton(b => b.setButtonText("결과 확인").onClick(async () => {
        b.setDisabled(true);
        try { await this.plugin.coordinator.reconcile(this.plugin.client(), job); this.render(); }
        catch (e) { new Notice(message(e), 8000); }
        finally { b.setDisabled(false); }
      }));
    }
  }
}
