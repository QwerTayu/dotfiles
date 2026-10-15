#!/bin/bash
# 使い方: apply-layout.sh current        今フォーカスしているペインを左に残して並べる（キーから）
#         apply-layout.sh new-workspace  作られたワークスペースを並べ、左で LEFT_CMD を起動する（イベントから）
#         apply-layout.sh tab <ペイン ID> <タブ名> [<コマンド>]
#                                        渡したペインを左に残して並べ、左でコマンドを起動し、タブの名前を変える（skill などから）
#         apply-layout.sh restore        この並びのタブすべてで、右上に fresh と lazygit を起動し直す（herdr の起動時から）
set -u
herdr=${HERDR_BIN_PATH:-herdr}
here=$(cd "$(dirname "$0")" && pwd)

# 各ペインで起動するコマンド（空にすると何も起動しない）
LEFT_CMD="claude"     # 新しいワークスペースのときだけ起動する（既存のタブでは今のペインをそのまま使う）
TOP_LEFT_CMD="'$here/fresh-trusted.sh' ."  # 初めてのディレクトリでも信頼済みにしてから fresh を開く
TOP_RIGHT_CMD="lazygit"

# JSON から "key": "value" の最初の値を取り出す（jq を使わずに済ませる）
json_get() { grep -o "\"$1\": *\"[^\"]*\"" | head -1 | sed 's/.*"\([^"]*\)"$/\1/'; }

# ペインでシェルだけが動いているか（前面のプロセスグループがシェル自身なら、まだ何も起動していない。
# 起動直後の path_helper などもシェルのグループで動く）
pane_idle() {
  local info
  info=$("$herdr" pane process-info --pane "$1" 2>/dev/null)
  num_get() { printf '%s' "$info" | grep -o "\"$1\": *[0-9]*" | head -1 | grep -o '[0-9]*$'; }
  [ -n "$(num_get shell_pid)" ] && [ "$(num_get foreground_process_group_id)" = "$(num_get shell_pid)" ]
}

# herdr を起動し直すと、ペインの並びとディレクトリは戻るが、中のプロセスは戻らずシェルになる。
# この並び（左に 1 つ、右上に 2 つ、右下に 1 つ）のタブを探して、右上でシェルだけのペインに fresh と lazygit を起動する。
# 並びの形だけで見分けるので、右上で別のものを使っていたタブでも fresh と lazygit になる
restore() {
  local tab pane rects left tops top_left top_right p i
  # 各タブの最初のペイン（pane list はペインごとに pane_id、tab_id の順で並ぶ）
  "$herdr" pane list | grep -o '"\(pane_id\|tab_id\)": *"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/' |
    paste - - | sort -u -k2,2 | while read -r pane tab; do
      # 各ペインを「x y ペイン ID」の行にする
      rects=$("$herdr" pane layout --pane "$pane" |
        grep -o '"pane_id": *"[^"]*", *"rect": *{[^}]*}' |
        sed 's/.*"pane_id": *"\([^"]*\)".*"x": *\([0-9]*\).*"y": *\([0-9]*\).*/\2 \3 \1/')
      [ "$(printf '%s\n' "$rects" | grep -c .)" -eq 4 ] || continue
      left=$(printf '%s\n' "$rects" | awk '$1 == 0' | grep -c .)
      tops=$(printf '%s\n' "$rects" | awk '$1 > 0 && $2 == 0' | sort -n | awk '{print $3}')
      [ "$left" -eq 1 ] && [ "$(printf '%s\n' "$tops" | grep -c .)" -eq 2 ] || continue
      top_left=$(printf '%s\n' "$tops" | sed -n 1p)
      top_right=$(printf '%s\n' "$tops" | sed -n 2p)
      for p in "$top_left" "$top_right"; do
        # 起動直後はシェルがまだ立ち上がっていないことがあるので、少し待つ
        for i in 1 2 3 4 5 6 7 8 9 10; do
          "$herdr" pane process-info --pane "$p" 2>/dev/null | grep -q '"shell_pid": *[0-9]' && break
          sleep 1
        done
      done
      pane_idle "$top_left" && [ -n "$TOP_LEFT_CMD" ] && "$herdr" pane run "$top_left" "$TOP_LEFT_CMD" >/dev/null
      pane_idle "$top_right" && [ -n "$TOP_RIGHT_CMD" ] && "$herdr" pane run "$top_right" "$TOP_RIGHT_CMD" >/dev/null
    done
}

case "${1:-current}" in
  current)
    left=${HERDR_PANE_ID:-}
    left_cmd= tab_name=
    ;;
  new-workspace)
    ws=$(printf '%s' "${HERDR_PLUGIN_EVENT_JSON:-}" | json_get workspace_id)
    [ -n "$ws" ] || exit 0
    panes=$("$herdr" pane list 2>/dev/null | grep -o "\"pane_id\": *\"$ws:[^\"]*\"" | sed 's/.*"\([^"]*\)"$/\1/')
    # ペインを移して作ったワークスペースなどは並べ替えない（ペインが1つで、シェルだけが動いているときだけ）
    [ "$(printf '%s\n' "$panes" | grep -c .)" -eq 1 ] || exit 0
    left=$panes
    pane_idle "$left" || exit 0
    left_cmd=$LEFT_CMD
    tab_name=main  # 最初のタブは main にする（役割ごとのタブはあとから足す）
    ;;
  tab)
    left=${2:-} tab_name=${3:-} left_cmd=${4:-}
    [ -n "$tab_name" ] || { echo "usage: $0 tab <pane-id> <tab-name> [<command>]" >&2; exit 1; }
    ;;
  restore)
    restore
    exit 0
    ;;
  *)
    echo "usage: $0 current|new-workspace|tab <pane-id> <tab-name> [<command>]|restore" >&2
    exit 1
    ;;
esac
[ -n "$left" ] || exit 1

split() {  # 使い方: split <ペイン> <right|down> <元のペインの割合> → 新しいペインの ID
  "$herdr" pane split --pane "$1" --direction "$2" --ratio "$3" --no-focus | json_get pane_id
}

right=$(split "$left" right 0.25)        # 左 1/4 と右 3/4
bottom=$(split "$right" down 0.75)       # 右の上 3/4 と下 1/4（ターミナル）
top_right=$(split "$right" right 0.5)    # 右上を左右半分に（左が fresh、右が lazygit）

[ -n "$TOP_LEFT_CMD" ] && "$herdr" pane run "$right" "$TOP_LEFT_CMD" >/dev/null
[ -n "$TOP_RIGHT_CMD" ] && "$herdr" pane run "$top_right" "$TOP_RIGHT_CMD" >/dev/null
[ -n "$left_cmd" ] && "$herdr" pane run "$left" "$left_cmd" >/dev/null
if [ -n "$tab_name" ]; then
  tab=$("$herdr" pane get "$left" | json_get tab_id)
  [ -n "$tab" ] && "$herdr" tab rename "$tab" "$tab_name" >/dev/null
fi
: "$bottom"  # 右下はシェルのまま
exit 0
