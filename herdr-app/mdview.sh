#!/bin/bash
# Markdown（Marp のスライドも）を、Herdr アプリの今のペインの右に開く（mod の md-preview）。
# 使い方: mdview <ファイル.md> [down]（down で下に開く）
set -eu
if [ $# -lt 1 ] || [ ! -f "$1" ]; then
  echo "使い方: mdview <ファイル.md> [down]" >&2
  exit 1
fi
file=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
direction=${2:-right}
args=$(/usr/bin/python3 -I -c 'import json,sys; print(json.dumps({"direction": sys.argv[2], "mod": "md-preview", "props": {"file": sys.argv[1]}}))' "$file" "$direction")
herdr-app do pane.split "$args" >/dev/null
