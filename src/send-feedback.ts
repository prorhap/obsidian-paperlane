import type { Job } from "./types";

export interface SendFeedback {
  kind: "success" | "warning" | "error";
  title: string;
  action: "done" | "history" | "retry";
}
/** A saved ID takes precedence over verification errors; an unknown save never invites retry. */
export function sendFeedback(job: Pick<Job, "status" | "bookmarkId">): SendFeedback {
  if (job.bookmarkId) return job.status === "verified"
    ? { kind: "success", title: "Saved to Instapaper", action: "done" }
    : { kind: "warning", title: "Saved to Instapaper — check details", action: "done" };
  if (job.status === "failed") return { kind: "error", title: "Could not save to Instapaper", action: "retry" };
  return { kind: "warning", title: "Save not confirmed — check history before retrying", action: "history" };
}
