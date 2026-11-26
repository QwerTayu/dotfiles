#!/bin/bash
# files-qt の mod が使う Material Icon Theme のアイコンを入れる（setup.sh が呼ぶ。何度実行しても安全）。
# VS Code の Material Icon Theme（npm の material-icon-theme。MIT）を版を決めて落とし、npm に載っている sha512 で確かめてから、
#   - icons/*.svg を ~/.config/herdr-app/mods/files-qt/icons/ に置く
#   - どのファイル名・拡張子・フォルダ名にどのアイコンを使うかの表（dist/material-icons.json）を、mod が読む icon-map.json に縮めて置く
# アイコンは約 1,200 個・1.6MB あるので dotfiles には入れず、ここで毎回作る。
set -eu
VERSION=5.40.0
DEST="$HOME/.config/herdr-app/mods/files-qt"
PY=/usr/bin/python3

if [ -f "$DEST/icon-map.json" ] && grep -q "\"version\": \"$VERSION\"" "$DEST/icon-map.json"; then
  echo "files-qt icons: $VERSION (already installed)"
  exit 0
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
meta=$(curl -fsSL "https://registry.npmjs.org/material-icon-theme/$VERSION")
url=$(printf '%s' "$meta" | "$PY" -I -c 'import json,sys; print(json.load(sys.stdin)["dist"]["tarball"])')
want=$(printf '%s' "$meta" | "$PY" -I -c 'import json,sys; print(json.load(sys.stdin)["dist"]["integrity"])')
curl -fsSL "$url" -o "$tmp/mit.tgz"
got="sha512-$(openssl dgst -sha512 -binary "$tmp/mit.tgz" | base64)"
[ "$got" = "$want" ] || { echo "material-icon-theme の tarball の sha512 が合いません" >&2; exit 1; }
tar -xzf "$tmp/mit.tgz" -C "$tmp" package/icons package/dist/material-icons.json package/LICENSE

mkdir -p "$DEST"
rm -rf "$DEST/icons"
mv "$tmp/package/icons" "$DEST/icons"
cp "$tmp/package/LICENSE" "$DEST/icons/LICENSE-material-icon-theme.txt"

"$PY" -I - "$tmp/package/dist/material-icons.json" "$DEST/icon-map.json" "$VERSION" <<'PY'
import json, os, sys
src, out, version = sys.argv[1:4]
d = json.load(open(src))
icon = lambda key: os.path.splitext(os.path.basename(d["iconDefinitions"][key]["iconPath"]))[0]
lower = lambda m: {k.lower(): icon(v) for k, v in m.items() if v in d["iconDefinitions"]}
exts = lower(d["fileExtensions"])
# VS Code が言語で決めるもの（ts・js・py など）は表の fileExtensions に無いので、よく使う拡張子を言語の名前から引く
LANGS = {"ts": "typescript", "mts": "typescript", "cts": "typescript", "tsx": "typescriptreact", "js": "javascript",
         "mjs": "javascript", "cjs": "javascript", "jsx": "javascriptreact", "py": "python", "json": "json",
         "jsonc": "jsonc", "md": "markdown", "sh": "shellscript", "bash": "shellscript", "zsh": "shellscript",
         "yml": "yaml", "yaml": "yaml", "html": "html", "htm": "html", "css": "css", "scss": "scss", "sass": "sass",
         "less": "less", "go": "go", "rs": "rust", "java": "java", "c": "c", "h": "c", "cpp": "cpp", "hpp": "cpp",
         "cs": "csharp", "rb": "ruby", "php": "php", "swift": "swift", "kt": "kotlin", "lua": "lua", "sql": "sql",
         "xml": "xml", "vue": "vue", "svelte": "svelte", "dart": "dart", "r": "r", "pl": "perl", "ps1": "powershell",
         "dockerfile": "dockerfile", "toml": "toml", "ini": "ini", "txt": "plaintext", "tex": "latex"}
for ext, lang in LANGS.items():
    if ext not in exts and lang in d.get("languageIds", {}):
        exts[ext] = icon(d["languageIds"][lang])
json.dump({
    "version": version,
    "file": icon(d["file"]), "folder": icon(d["folder"]), "folderOpen": icon(d["folderExpanded"]),
    "names": lower(d["fileNames"]), "exts": exts,
    "folders": lower(d["folderNames"]), "foldersOpen": lower(d["folderNamesExpanded"]),
}, open(out, "w"), indent=1, ensure_ascii=False)
PY
echo "files-qt icons: $VERSION ($(ls "$DEST/icons" | wc -l | tr -d ' ') files)"
