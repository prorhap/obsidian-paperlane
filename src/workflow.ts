import { randomUUID } from "node:crypto";
import type { Article, Job } from "./types";
import { InstapaperClient, ApiError } from "./client";
import { hash } from "./images";
import { verify } from "./verification";
import { CONVERTER_VERSION } from "./converter";

export interface Journal {
  jobs: Job[];
  flush(): Promise<void>;
}
export type ScheduleTimeout = (callback: () => void, milliseconds: number) => () => void;
const browserTimeout: ScheduleTimeout = (callback, milliseconds) => {
  const timer = window.setTimeout(callback, milliseconds);
  return () => window.clearTimeout(timer);
};
export class SendCoordinator {
  private busy = false;
  constructor(private journal: Journal, private timeoutMs = 45000, private schedule: ScheduleTimeout = browserTimeout) {}
  async send(client: InstapaperClient, accountId: number, path: string, article: Article, folderId?: number): Promise<Job> {
    if (this.busy) throw new Error("다른 전송 또는 확인 작업이 진행 중입니다.");
    this.busy = true;
    try {
      const current = await client.me();
      if (current.id !== accountId) throw new Error("계정이 변경되었습니다. 미리보기를 다시 여세요.");
      if (folderId) {
        const folder = (await client.folders()).find(f => f.id === folderId);
        if (!folder || folder.public) throw new Error("현재 계정의 비공개 폴더를 다시 선택하세요.");
      }
      const fingerprint = hash(JSON.stringify([CONVERTER_VERSION, article.title, article.html,
        ...(article.tags?.length ? [[...article.tags].sort()] : [])]));
      const jobs = this.journal.jobs.filter(j => j.accountId === accountId && j.path === path);
      if (jobs.some(j => ["unknown","submitting"].includes(j.status)))
        throw new Error("이 파일의 이전 전송 결과가 불명확합니다. 전송 이력에서 결과 확인을 먼저 실행하세요.");
      const duplicate = jobs.find(j => j.hash === fingerprint && j.bookmarkId);
      if (duplicate) return duplicate;
      const job: Job = { id: randomUUID(), accountId, path, title: article.title, hash: fingerprint,
        started: Date.now(), status: "submitting", notes: [] };
      this.journal.jobs.push(job);
      try { await this.journal.flush(); } // If this fails, no POST is sent.
      catch (e) {
        job.status = "failed"; job.notes = ["로컬 이력을 기록하지 못해 전송을 시작하지 않았습니다."];
        throw e;
      }
      let cancelTimeout: (() => void) | undefined;
      const pending = client.save(article, job.id, folderId);
      try {
        const saved = await Promise.race([
          pending,
          new Promise<never>((_, reject) => { cancelTimeout = this.schedule(() => reject(new ApiError(0, "응답 대기 시간 초과")), this.timeoutMs); }),
        ]);
        job.bookmarkId = saved.id; job.status = "saved";
        try { await this.journal.flush(); }
        catch { throw new Error(`저장은 완료됐지만 이력 기록에 실패했습니다. 저장 ID: ${saved.id}`); }
        await this.verifySaved(client, job, article);
      } catch (e) {
        if (job.bookmarkId) throw e;
        job.status = e instanceof ApiError && [400,401,402,403,404].includes(e.status) ? "failed" : "unknown";
        job.notes = [job.status === "failed" ? (e as Error).message : "응답을 확인하지 못했습니다. 새로 보내지 말고 결과 확인을 실행하세요."];
        await this.journal.flush();
        // A UI timeout does not abort requestUrl. Accept a late success without making another POST.
        void pending.then(async saved => {
          if (job.status === "unknown") {
            job.bookmarkId = saved.id; job.status = "saved";
            job.notes = ["늦게 도착한 저장 응답을 확인했습니다. 본문 재확인이 필요합니다."];
            try { await this.journal.flush(); } catch { /* ID remains visible in session history. */ }
          }
        }).catch(() => {});
      } finally { cancelTimeout?.(); }
      return job;
    } finally { this.busy = false; }
  }
  async verifySaved(client: InstapaperClient, job: Job, article?: Article): Promise<void> {
    if (!job.bookmarkId) throw new Error("저장 ID가 없습니다.");
    try {
      const parsed = await client.parse(job.bookmarkId);
      job.notes = article ? verify(article, parsed) : ["본문 조회 성공. 원래 전송 사본이 없어 내용과 이미지의 전체 비교는 하지 않았습니다."];
      if (article?.warnings.some(w => w.loss)) job.notes.push("사용자가 확인한 변환 손실이 있습니다.");
      job.status = article && !job.notes.length ? "verified" : "warning";
      if (!job.notes.length) job.notes = ["본문과 그림 참조 확인. 앱 표시와 오프라인 그림은 직접 확인해야 합니다."];
    } catch (e) {
      job.status = "warning";
      job.notes = [`저장됨. 본문 조회 실패: ${e instanceof Error ? e.message : "확인 불가"}`];
    }
    await this.journal.flush();
  }
  async reconcile(client: InstapaperClient, job: Job): Promise<void> {
    if (this.busy) throw new Error("다른 작업이 진행 중입니다.");
    this.busy = true;
    try {
      if ((await client.me()).id !== job.accountId) throw new Error("이 전송과 연결 계정이 다릅니다.");
      if (!job.bookmarkId) {
        const matches = await client.findJob(job.id, job.started);
        if (matches.length !== 1) {
          job.notes = ["저장 여부를 확정하지 못했습니다. Instapaper 목록을 직접 확인하세요. 자동으로 재전송하지 않습니다."];
          await this.journal.flush(); return;
        }
        job.bookmarkId = matches[0]!.id;
      }
      await this.verifySaved(client, job);
    } finally { this.busy = false; }
  }
}
