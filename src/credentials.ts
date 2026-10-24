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
      throw new Error("환경 변수 이름은 영문, 숫자, 밑줄만 사용하고 숫자로 시작할 수 없습니다.");
    }
    value = Object.hasOwn(env, name) ? env[name] : undefined;
    if (!value?.trim()) throw new Error("환경 변수에 토큰이 없습니다. 환경 변수를 전달하여 Obsidian을 다시 실행하세요.");
  } else if (source === "secret-storage") {
    value = settings.secretId ? getSecret(settings.secretId) : undefined;
    if (!value?.trim()) throw new Error("플러그인 설정에서 개인 액세스 토큰을 선택하고 연결을 확인하세요.");
  } else {
    throw new Error("지원하지 않는 토큰 읽기 방식입니다.");
  }
  // Reject header delimiters before trimming; never include the value in errors.
  if (Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new Error("토큰에 허용되지 않는 제어 문자가 있습니다.");
  return value.trim();
}
