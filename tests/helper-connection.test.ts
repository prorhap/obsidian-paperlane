import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { connectHelper, type PairingChallenge } from "../src/helper-connection";

test("automatic connection proves directory access without exposing proof over HTTP", async () => {
  let saved: PairingChallenge | undefined;
  let removed = false;
  const token = "t".repeat(43);
  const result = await connectHelper({
    write: async (name, value) => { saved = value; assert.equal(name, `connection-${value.nonce}.json`); },
    remove: async () => { removed = true; },
    request: async nonce => {
      assert.equal(nonce, saved!.nonce); assert.notEqual(nonce, saved!.proof);
      const signature = createHmac("sha256", saved!.proof).update(`paperlane-pair-v1:${nonce}:${token}`).digest("hex");
      return { status: 200, json: { token, signature } };
    },
  });
  assert.equal(result, token); assert(removed);
});

test("an impersonating local endpoint cannot authenticate without reading the challenge", async () => {
  let removed = false;
  await assert.rejects(connectHelper({
    write: async () => {}, remove: async () => { removed = true; },
    request: async () => ({ status: 200, json: { token: "t".repeat(43), signature: "0".repeat(64) } }),
  }), /Could not verify/);
  assert(removed);
});

test("failed or old helpers clean up temporary challenges and explain restart", async () => {
  for (const fail of [true, false]) {
    let removed = false;
    await assert.rejects(connectHelper({
      write: async () => {}, remove: async () => { removed = true; },
      request: async () => { if (fail) throw new Error("offline"); return { status: 403, json: {} }; },
    }));
    assert(removed);
  }
});

test("connection response cannot smuggle invalid tokens or leave a challenge behind", async () => {
  for (const token of ["", "secret\nheader", "x".repeat(101)]) {
    let removed = false;
    await assert.rejects(connectHelper({ write: async () => {}, remove: async () => { removed = true; },
      request: async () => ({ status: 200, json: { token, signature: "a".repeat(64) } }),
    }), /invalid connection response/);
    assert(removed);
  }
});
