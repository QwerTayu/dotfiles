#!/bin/bash
# Mermaid の図を PNG にする（md-preview の mod が呼ぶ）。
# 使い方: mermaid-png.sh <図の文字のファイル> <書き出す PNG>
# mermaid-cli は依存が mise の trust policy で止まったので使わず、mermaid.js を Google Chrome の headless で動かす。
#   1 回目: 図を SVG にして、DOM から大きさを取る（--dump-dom）
#   2 回目: その大きさの画面で、透明な背景のまま撮る（--screenshot。2 倍の解像度）
# mermaid.js は版を決めて npm から 1 度だけ落とし、npm に載っている sha512 で確かめてから使う。
set -eu
VERSION=12.3.0
INTEGRITY="sha512-4113TdXeLAsMruJ79OpFL5O"  # 先頭だけ控え、全体は npm のメタデータと照らす
VENDOR="$HOME/.local/share/herdr-md-preview"
JS="$VENDOR/mermaid-$VERSION.min.js"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PY=/usr/bin/python3

src=$1
out=$2
[ -x "$CHROME" ] || { echo "Google Chrome が見つかりません" >&2; exit 1; }

if [ ! -f "$JS" ]; then
  mkdir -p "$VENDOR"
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  meta=$(curl -fsSL "https://registry.npmjs.org/mermaid/$VERSION")
  url=$(printf '%s' "$meta" | "$PY" -I -c 'import json,sys; print(json.load(sys.stdin)["dist"]["tarball"])')
  want=$(printf '%s' "$meta" | "$PY" -I -c 'import json,sys; print(json.load(sys.stdin)["dist"]["integrity"])')
  case "$want" in "$INTEGRITY"*) ;; *) echo "mermaid $VERSION の integrity が控えと違います" >&2; exit 1 ;; esac
  curl -fsSL "$url" -o "$tmp/mermaid.tgz"
  got="sha512-$(openssl dgst -sha512 -binary "$tmp/mermaid.tgz" | base64)"
  [ "$got" = "$want" ] || { echo "mermaid の tarball の sha512 が合いません" >&2; exit 1; }
  tar -xzf "$tmp/mermaid.tgz" -C "$tmp" package/dist/mermaid.min.js
  mv "$tmp/package/dist/mermaid.min.js" "$JS"
  rm -rf "$tmp"
  trap - EXIT
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
chrome() {
  "$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
    --user-data-dir="$work/profile" --allow-file-access-from-files "$@" 2>/dev/null
}

# 1 回目: SVG にする。図の文字は JSON にして埋め込む（HTML として解釈させない）
"$PY" -I - "$src" "$JS" "$work/render.html" <<'PY'
import json, sys
code = open(sys.argv[1]).read()
page = f"""<!doctype html><html><body><div id="out"></div><script src="file://{sys.argv[2]}"></script><script>
mermaid.initialize({{ startOnLoad: false, theme: "dark", securityLevel: "strict" }});
mermaid.render("d", {json.dumps(code)})
  .then(r => {{ document.getElementById("out").innerHTML = r.svg; }})
  .catch(e => {{ document.getElementById("out").setAttribute("data-error", String(e && e.message || e)); }});
</script></body></html>"""
open(sys.argv[3], "w").write(page)
PY
chrome --virtual-time-budget=10000 --dump-dom "file://$work/render.html" > "$work/dom.html"

# 大きさを取り、2 回目の画面を作る
size=$("$PY" -I - "$work/dom.html" "$work/shot.html" <<'PY'
import html, re, sys
t = open(sys.argv[1]).read()
err = re.search(r'data-error="([^"]*)"', t)
if err:
    sys.exit("Mermaid の書き方の誤り: " + html.unescape(err.group(1)))
m = re.search(r"<svg[\s\S]*</svg>", t)
if not m:
    sys.exit("図を描けませんでした")
svg = m.group(0)
vb = re.search(r'viewBox="([-\d. ]+)"', svg).group(1).split()
w, h = float(vb[2]), float(vb[3])
svg = re.sub(r'width="100%"', f'width="{w}" height="{h}"', svg, count=1).replace("max-width:", "x-max-width:", 1)
open(sys.argv[2], "w").write(f'<!doctype html><html><body style="margin:0;background:transparent">{svg}</body></html>')
print(int(w + 1), int(h + 1))
PY
)
w=${size% *}
h=${size#* }
chrome --hide-scrollbars --default-background-color=00000000 --force-device-scale-factor=2 \
  --window-size="$w,$h" --screenshot="$out" "file://$work/shot.html" >/dev/null
[ -s "$out" ] || { echo "PNG を書き出せませんでした" >&2; exit 1; }
echo "$w $h"
