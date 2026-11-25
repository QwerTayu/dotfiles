#!/bin/bash
# Herdr アプリ同梱の mod・layout のうち、複製して直したものの元（upstream.json に書いた版）が、
# アプリの更新で変わったかを確かめる。変わっていたら macOS の通知で知らせる。
# homebrew/brew-check.sh が毎日呼ぶ。手で実行してもよい。
#
# アプリは同梱のファイルのハッシュを ~/.config/herdr-app/installed.json に記録している。
# 複製したときのハッシュを upstream.json に控えておき、それと比べる。
# 取り込んだら、upstream.json を今の installed.json の値に書き直す（readme の「Herdr アプリの mod を複製して直したもの」）。
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALLED="$HOME/.config/herdr-app/installed.json"
[ -f "$INSTALLED" ] || exit 0

changed=$(/usr/bin/python3 -I - "$DIR/upstream.json" "$INSTALLED" <<'PY'
import json, sys
base = json.load(open(sys.argv[1]))
now = json.load(open(sys.argv[2]))
print(" ".join(k for k in base if now.get(k) != base[k]))
PY
)
if [ -z "$changed" ]; then
  echo "herdr-app upstream: no changes"
  exit 0
fi
echo "herdr-app upstream changed: $changed"
osascript - "$changed" <<'APPLESCRIPT'
on run argv
  display notification ("元が変わった: " & (item 1 of argv) & "。複製した mod・layout に取り込むか確かめる（~/dotfiles/herdr-app）") with title "Herdr アプリの mod"
end run
APPLESCRIPT
