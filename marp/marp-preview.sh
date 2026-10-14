#!/bin/bash
# Marp のスライドを terminal-browser で右のペインに表示する。
# 使い方: marp-preview [スライドの .md ファイル | フォルダ]（省略すると今のフォルダ）
# marp のプレビュー用サーバーを立て、ファイルを保存するとスライドも更新される。
# Ctrl+C でサーバーを止めると、herdr の中なら開いた terminal-browser のペインも閉じる。
set -eu

target=${1:-.}
if [ -d "$target" ]; then
  dir=$target
  page=""
elif [ -f "$target" ]; then
  dir=$(dirname "$target")
  page=$(basename "$target")
else
  echo "marp-preview: $target が見つかりません" >&2
  exit 1
fi

# 空いているポートを使う（8080 から順に探す）
port=8080
while lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do
  port=$((port + 1))
done

# herdr の中なら、今のワークスペースのペインの一覧を出す（開いたブラウザのペインを見分けるため）
workspace_panes() {
  [ -n "${HERDR_PANE_ID:-}" ] || return 0
  ws=$(herdr pane get "$HERDR_PANE_ID" 2>/dev/null | grep -o '"workspace_id": *"[^"]*"' | head -1 | cut -d'"' -f4)
  [ -n "$ws" ] || return 0
  herdr pane list --workspace "$ws" 2>/dev/null | grep -o '"pane_id": *"[^"]*"' | cut -d'"' -f4 | sort -u
}

browser_pane=
cleanup() {
  kill "$server" 2>/dev/null || true
  [ -n "$browser_pane" ] && herdr pane close "$browser_pane" >/dev/null 2>&1
  browser_pane=
}

PORT=$port marp --server --watch "$dir" &
server=$!
trap cleanup EXIT
trap 'exit 130' INT TERM

# サーバーが立ち上がるまで待つ（最大10秒）
for _ in $(seq 1 50); do
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 && break
  sleep 0.2
done

before=$(workspace_panes)
# --no-merge: 隣のブラウザのタブにせず、必ず自分のペインで開く（閉じるときに見分けられるように）
terminal-browser open "localhost:$port/$page" --split right --no-merge
if [ -n "${HERDR_PANE_ID:-}" ]; then
  for _ in $(seq 1 25); do
    browser_pane=$(comm -13 <(printf '%s\n' "$before") <(workspace_panes) | head -1)
    [ -n "$browser_pane" ] && break
    sleep 0.2
  done
fi
echo "marp-preview: http://localhost:$port/$page を表示中（Ctrl+C で止める）"
wait "$server"
