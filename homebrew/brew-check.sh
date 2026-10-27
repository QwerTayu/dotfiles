#!/bin/bash
# Homebrew の一覧を更新して、古くなったものがあれば macOS の通知で知らせる。
# launchd（launchd/com.qwertayu.brew-check.plist）が毎日 10:00 に実行する。
# 更新そのもの（brew upgrade）はしない。通知を見て自分で実行する。
set -u
BREW=/opt/homebrew/bin/brew

# launchd から動かすと出力の行き先がないので、ログに残す
exec >>"$HOME/Library/Logs/brew-check.log" 2>&1
echo "== $(date '+%Y-%m-%d %H:%M:%S')"

notify() {  # 使い方: notify <タイトル> <本文>
  osascript - "$1" "$2" <<'APPLESCRIPT'
on run argv
  display notification (item 2 of argv) with title (item 1 of argv)
end run
APPLESCRIPT
}

if ! "$BREW" update --quiet; then
  notify "Homebrew" "brew update に失敗しました（~/Library/Logs/brew-check.log）"
  exit 1
fi

# Python は uv で管理しているので、Homebrew の Python（何かの依存で入る）があれば知らせる
pythons=$("$BREW" list --formula | grep '^python@')
if [ -n "$pythons" ]; then
  for py in $pythons; do
    users=$("$BREW" uses --installed "$py" | paste -sd ',' - | sed 's/,/, /g')
    echo "homebrew python: $py (used by: ${users:-none})"
    if [ -n "$users" ]; then
      notify "Homebrew の Python が入っています" "${py}（依存元: ${users}）。uv tool で入れ直せないか確かめる"
    else
      # 依存元がないのは、ビルドのときだけ使われて残ったもの
      notify "Homebrew の Python が入っています" "${py}（依存元なし）。brew autoremove で消せる"
    fi
  done
fi

outdated=$("$BREW" outdated --quiet)
if [ -z "$outdated" ]; then
  echo "no updates"
  exit 0
fi
echo "$outdated"

# 通知には先頭の5件だけ名前を出す
count=$(printf '%s\n' "$outdated" | wc -l | tr -d ' ')
names=$(printf '%s\n' "$outdated" | head -5 | paste -sd ',' - | sed 's/,/, /g')
[ "$count" -gt 5 ] && names="$names, ..."
notify "Homebrew: ${count}件の更新" "${names}（brew upgrade で更新）"
