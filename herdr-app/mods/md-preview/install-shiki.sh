#!/bin/bash
# md-preview の mod がコードブロックの色付けに使う Shiki を入れる（setup.sh が呼ぶ。何度実行しても安全）。
# Shiki は VS Code と同じ文法の定義（TextMate）で色を付ける。版を決めて ~/.local/share/herdr-md-preview/ に入れ、mise の Node で動かす。
# npm の install スクリプトは動かさない（--ignore-scripts）。Shiki はそれを必要としない。
set -eu
VERSION=4.6.0
DEST="$HOME/.local/share/herdr-md-preview/shiki-$VERSION"
NPM="$HOME/.local/share/mise/shims/npm"

if [ -f "$DEST/node_modules/shiki/package.json" ]; then
  echo "md-preview shiki: $VERSION (already installed)"
  exit 0
fi
[ -x "$NPM" ] || { echo "mise の npm が見つかりません（mise install で node を入れる）" >&2; exit 1; }
mkdir -p "$DEST"
printf '{ "name": "herdr-md-preview-shiki", "private": true }\n' > "$DEST/package.json"
"$NPM" install --prefix "$DEST" --ignore-scripts --no-audit --no-fund --omit=dev "shiki@$VERSION" >/dev/null
# 古い版は消す
for old in "$HOME/.local/share/herdr-md-preview"/shiki-*; do
  [ "$old" = "$DEST" ] || rm -rf "$old"
done
echo "md-preview shiki: $VERSION installed"
