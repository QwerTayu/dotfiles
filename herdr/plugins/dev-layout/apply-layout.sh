#!/bin/bash
# 使い方: apply-layout.sh current        今フォーカスしているペインを左に残して並べる（キーから）
#         apply-layout.sh new-workspace  作られたワークスペースを並べ、左で LEFT_CMD を起動する（イベントから）
set -u
herdr=${HERDR_BIN_PATH:-herdr}
here=$(cd "$(dirname "$0")" && pwd)

# 各ペインで起動するコマンド（空にすると何も起動しない）
LEFT_CMD="claude"     # 新しいワークスペースのときだけ起動する（既存のタブでは今のペインをそのまま使う）
TOP_LEFT_CMD="'$here/fresh-trusted.sh' ."  # 初めてのディレクトリでも信頼済みにしてから fresh を開く
TOP_RIGHT_CMD="lazygit"

# JSON から "key": "value" の最初の値を取り出す（jq を使わずに済ませる）
json_get() { grep -o "\"$1\": *\"[^\"]*\"" | head -1 | sed 's/.*"\([^"]*\)"$/\1/'; }

case "${1:-current}" in
  current)
    left=${HERDR_PANE_ID:-}
    ;;
  new-workspace)
    ws=$(printf '%s' "${HERDR_PLUGIN_EVENT_JSON:-}" | json_get workspace_id)
    [ -n "$ws" ] || exit 0
    panes=$("$herdr" pane list 2>/dev/null | grep -o "\"pane_id\": *\"$ws:[^\"]*\"" | sed 's/.*"\([^"]*\)"$/\1/')
    # ペインを移して作ったワークスペースなどは並べ替えない（ペインが1つで、シェルだけが動いているときだけ）
    [ "$(printf '%s\n' "$panes" | grep -c .)" -eq 1 ] || exit 0
    left=$panes
    # 前面のプロセスグループがシェル自身なら、まだ何も起動していない（起動直後の path_helper などもシェルのグループで動く）
    info=$("$herdr" pane process-info --pane "$left" 2>/dev/null)
    num_get() { printf '%s' "$info" | grep -o "\"$1\": *[0-9]*" | head -1 | grep -o '[0-9]*$'; }
    [ -n "$(num_get shell_pid)" ] && [ "$(num_get foreground_process_group_id)" = "$(num_get shell_pid)" ] || exit 0
    ;;
  *)
    echo "usage: $0 current|new-workspace" >&2
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
if [ "${1:-current}" = new-workspace ]; then
  [ -n "$LEFT_CMD" ] && "$herdr" pane run "$left" "$LEFT_CMD" >/dev/null
  # 最初のタブは main にする（役割ごとのタブはあとから足す）
  tab=$("$herdr" pane get "$left" | json_get tab_id)
  [ -n "$tab" ] && "$herdr" tab rename "$tab" main >/dev/null
fi
: "$bottom"  # 右下はシェルのまま
exit 0
