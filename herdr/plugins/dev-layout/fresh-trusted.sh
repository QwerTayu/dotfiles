#!/bin/bash
# 使い方: fresh-trusted.sh [fresh の引数...]
# 今のディレクトリを fresh で信頼済みにしてから fresh を起動する（初回の「このフォルダを信頼しますか」を出さない）。
# fresh はワークスペースごとの判断を ~/Library/Application Support/fresh/workspaces/<パスを変換した名前>/trust.json に保存している。
# すでに判断がある（Restricted や Blocked を選んだ）ディレクトリは書き換えない。
set -u

# git の linked worktree では、fresh は本体の worktree の判断を使う
root=$(pwd -P)
common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) &&
  [ "$common" != "$(git rev-parse --path-format=absolute --git-dir 2>/dev/null)" ] &&
  root=$(cd "$(dirname "$common")" && pwd -P)

# fresh の encode_path_for_filename と同じ変換（/ → _、英数字と - . はそのまま、ほかは %XX、先頭の _ を消し、連続する _ を 1 つにする）
encode() {
  local LC_ALL=C s=$1 out= c i
  for ((i = 0; i < ${#s}; i++)); do
    c=${s:i:1}
    case $c in
      /) out+=_ ;;
      [A-Za-z0-9.-]) out+=$c ;;
      *) out+=$(printf '%%%02X' "'$c") ;;
    esac
  done
  while [[ $out == _* ]]; do out=${out#_}; done
  while [[ $out == *__* ]]; do out=${out//__/_}; done
  printf '%s' "$out"
}

dir="$HOME/Library/Application Support/fresh/workspaces/$(encode "$root")"
if [ ! -s "$dir/trust.json" ]; then
  mkdir -p "$dir" && printf '{\n  "level": "trusted"\n}' >"$dir/trust.json"
fi

exec fresh "$@"
