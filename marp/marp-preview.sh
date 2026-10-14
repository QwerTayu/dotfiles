#!/bin/bash
# Marp のスライドを terminal-browser で右のペインに表示する。
# 使い方: marp-preview [スライドの .md ファイル | フォルダ]（省略すると今のフォルダ）
# marp のプレビュー用サーバーを立て、ファイルを保存するとスライドも更新される。Ctrl+C でサーバーを止める。
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

PORT=$port marp --server --watch "$dir" &
server=$!
trap 'kill "$server" 2>/dev/null' EXIT INT TERM

# サーバーが立ち上がるまで待つ（最大10秒）
for _ in $(seq 1 50); do
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 && break
  sleep 0.2
done

terminal-browser open "localhost:$port/$page" --split right
echo "marp-preview: http://localhost:$port/$page を表示中（Ctrl+C で止める）"
wait "$server"
