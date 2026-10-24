#!/bin/zsh
# Token is read silently, never placed in arguments or persisted to disk.
set +x
set -eu
app_binary="${OBSIDIAN_BINARY:-/Applications/Obsidian.app/Contents/MacOS/Obsidian}"
if [[ ! -x "$app_binary" ]]; then
  print -u2 "Obsidian 실행 파일을 찾을 수 없습니다. OBSIDIAN_BINARY에 경로를 지정하세요."
  exit 1
fi
if /usr/bin/pgrep -x Obsidian >/dev/null; then
  print -u2 "Obsidian을 Cmd+Q로 완전히 종료한 뒤 다시 실행하세요."
  exit 1
fi
read -rs 'INSTAPAPER_ACCESS_TOKEN?Instapaper 토큰 입력 (화면에 표시되지 않음): '
print
if [[ -z "$INSTAPAPER_ACCESS_TOKEN" ]]; then
  print -u2 "토큰이 비어 있습니다."
  exit 1
fi
export INSTAPAPER_ACCESS_TOKEN
exec "$app_binary" "$@"
