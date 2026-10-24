import test from "node:test";
import assert from "node:assert/strict";
import { resolveToken, DEFAULT_ENV_NAME } from "../src/credentials";

const noSecret = () => { throw new Error("Must not read secret storage"); };
test("environment source reads default or custom name without secret lookup", () => {
  assert.equal(resolveToken({ secretId: "old", credentialSource: "environment" },
    { [DEFAULT_ENV_NAME]: " dummy-token " }, noSecret), "dummy-token");
  assert.equal(resolveToken({ secretId: "", credentialSource: "environment", envVarName: "CUSTOM" },
    { CUSTOM: "custom-token" }, noSecret), "custom-token");
});
test("old settings still use secret storage and never read environment", () => {
  const env = new Proxy({}, { get() { throw new Error("Must not read environment"); } });
  assert.equal(resolveToken({ secretId: "existing" }, env, id => {
    assert.equal(id, "existing"); return "stored-token";
  }), "stored-token");
});
test("missing environment token never falls back to stored token", () => {
  for (const value of [undefined, "", "   "]) {
    assert.throws(() => resolveToken({ secretId: "old", credentialSource: "environment" },
      { [DEFAULT_ENV_NAME]: value }, noSecret), /No token was found/);
  }
});
test("invalid variable names and inherited values are rejected", () => {
  for (const name of ["", "1TOKEN", "A=B", "A B", "A\nB"]) {
    assert.throws(() => resolveToken({ secretId: "", credentialSource: "environment", envVarName: name },
      {}, noSecret), /environment variable name/);
  }
  assert.throws(() => resolveToken({ secretId: "", credentialSource: "environment" },
    Object.create({ [DEFAULT_ENV_NAME]: "inherited" }), noSecret), /No token was found/);
});
test("invalid tokens fail without leaking their value", () => {
  for (const value of ["sensitive\r\nheader", "sensitive\n", "sensitive\0", "sensitive\t"]) {
    assert.throws(() => resolveToken({ secretId: "", credentialSource: "environment" },
      { [DEFAULT_ENV_NAME]: value }, noSecret), error =>
        error instanceof Error && !error.message.includes("sensitive") && /control characters/.test(error.message));
  }
});
