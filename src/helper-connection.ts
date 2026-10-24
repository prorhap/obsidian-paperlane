import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { record } from "./ai";

export interface PairingChallenge { nonce: string; proof: string; expiresAt: number }
export interface PairingIO {
  write: (name: string, challenge: PairingChallenge) => Promise<void>;
  remove: (name: string) => Promise<void>;
  request: (nonce: string) => Promise<{ status: number; json: unknown }>;
}
/** Mutual proof of access to the exported helper directory; no credential is sent to /pair. */
export async function connectHelper(io: PairingIO): Promise<string> {
  const challenge = { nonce: randomBytes(32).toString("hex"), proof: randomBytes(32).toString("hex"), expiresAt: Date.now() + 120000 };
  const name = `connection-${challenge.nonce}.json`;
  await io.write(name, challenge);
  try {
    const response = await io.request(challenge.nonce);
    if (response.status !== 200 || !record(response.json)) throw new Error("Start the updated helper exported from this vault, then try again. No helper token is needed.");
    const { token, signature } = response.json;
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,100}$/.test(token) || typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature))
      throw new Error("The local helper returned an invalid connection response.");
    const expected = createHmac("sha256", challenge.proof).update(`paperlane-pair-v1:${challenge.nonce}:${token}`).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) throw new Error("Could not verify the local helper. Re-export and restart it from this vault.");
    return token;
  } finally {
    await io.remove(name);
  }
}
