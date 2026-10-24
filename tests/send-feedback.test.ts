import test from "node:test";
import assert from "node:assert/strict";
import { sendFeedback } from "../src/send-feedback";

test("confirmed saves finish even if verification failed", () => {
  assert.deepEqual(sendFeedback({ status: "verified", bookmarkId: 1 }), {
    kind: "success", title: "Saved to Instapaper", action: "done",
  });
  assert.equal(sendFeedback({ status: "warning", bookmarkId: 1 }).action, "done");
  assert.equal(sendFeedback({ status: "saved", bookmarkId: 1 }).kind, "warning");
});
test("unconfirmed saves direct users to history, only definitive failures offer retry", () => {
  for (const status of ["unknown", "submitting", "verified"] as const)
    assert.equal(sendFeedback({ status }).action, "history");
  assert.equal(sendFeedback({ status: "failed" }).action, "retry");
});
