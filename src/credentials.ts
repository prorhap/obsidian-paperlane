export const DEFAULT_ENV_NAME = "INSTAPAPER_ACCESS_TOKEN";
export interface CredentialSettings {
  secretId: string;
  credentialSource?: "secret-storage" | "environment";
  envVarName?: string;
}

/** Source selection is explicit: a missing environment value never falls back. */
export function resolveToken(
  settings: CredentialSettings,
  env: Record<string, string | undefined>,
  getSecret: (id: string) => string | null | undefined,
): string {
  let value: string | null | undefined;
  const source = settings.credentialSource ?? "secret-storage";
  if (source === "environment") {
    const name = settings.envVarName ?? DEFAULT_ENV_NAME;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error("The environment variable name must contain only letters, numbers, and underscores, and cannot start with a number.");
    }
    value = Object.hasOwn(env, name) ? env[name] : undefined;
    if (!value?.trim()) throw new Error("No token was found in the environment variable. Restart Obsidian with the variable set.");
  } else if (source === "secret-storage") {
    value = settings.secretId ? getSecret(settings.secretId) : undefined;
    if (!value?.trim()) throw new Error("Select a personal access token in Paperlane settings and check the connection.");
  } else {
    throw new Error("Unsupported token source.");
  }
  // Reject header delimiters before trimming; never include the value in errors.
  if (Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new Error("The token contains unsupported control characters.");
  return value.trim();
}
