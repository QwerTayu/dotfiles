#!/bin/bash
# pane.focused のたびに herdr が実行する。
# フォーカスしたペインで ASCII_APPS のどれかが動いていれば、今の入力ソースを覚えて英字（ABC）にする。
# それ以外のペインなら、覚えておいた入力ソースに戻す。
set -u

# 英字で使うアプリのプロセス名（`herdr pane process-info` の foreground_processes[].name）。増やすときはここに足す
ASCII_APPS=(
  lazygit
)

# 入力ソースを読む・切り替えるスクリプト（このプラグインのフォルダにある）
INPUT_SOURCE="${HERDR_PLUGIN_ROOT:-$(dirname "$0")}/input-source.js"
SAVED="${XDG_STATE_HOME:-$HOME/.local/state}/ascii-input-source/saved"
herdr=${HERDR_BIN_PATH:-herdr}

pane=$(printf '%s' "${HERDR_PLUGIN_EVENT_JSON:-}" | grep -o '"pane_id": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
pane=${pane:-${HERDR_PANE_ID:-}}
[ -n "$pane" ] || exit 0

# ペインの前面で動いているプロセスの名前（1行に1つ）
names=$("$herdr" pane process-info --pane "$pane" 2>/dev/null | grep -o '"name": *"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')

is_ascii_app() {
  local app
  for app in "${ASCII_APPS[@]}"; do
    printf '%s\n' "$names" | grep -qx -- "$app" && return 0
  done
  return 1
}

if is_ascii_app; then
  if [ ! -f "$SAVED" ]; then
    mkdir -p "$(dirname "$SAVED")"
    "$INPUT_SOURCE" > "$SAVED"
  fi
  "$INPUT_SOURCE" com.apple.keylayout.ABC
elif [ -f "$SAVED" ]; then
  "$INPUT_SOURCE" "$(cat "$SAVED")"
  rm -f "$SAVED"
fi
