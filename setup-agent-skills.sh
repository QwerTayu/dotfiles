#!/bin/bash
# Claude Code の global skill（~/.claude/skills/）を入れる。setup.sh から呼ばれる。
# ~/.claude/skills/ の中身は dotfiles に入れず、ここで毎回作り直す。
# 何度実行しても安全。更新はしない（他人の skill は `gh skill update --all` を手で実行する）。
set -eu
DOTFILES="$(cd "$(dirname "$0")" && pwd)"
SKILLS="$HOME/.claude/skills"
mkdir -p "$SKILLS"

# herdr: 公式 skill は herdr 本体が出力する。入っている herdr の版に合わせるため毎回書き出す
if command -v herdr >/dev/null 2>&1; then
  mkdir -p "$SKILLS/herdr"
  herdr --skill > "$SKILLS/herdr/SKILL.md"
  echo "skill: herdr (herdr --skill)"
fi

# 他人の skill: claude/skills.txt の各行を gh skill install で入れる
# 非対話の既定は --scope project / --agent github-copilot なので、必ず両方を指定する
list="$DOTFILES/claude/skills.txt"
if [ -f "$list" ] && command -v gh >/dev/null 2>&1; then
  while read -r repo path pin _; do
    case "$repo" in ''|'#'*) continue ;; esac
    name="$(basename "$path")"
    if [ -e "$SKILLS/$name" ]; then
      echo "skill: $name (already installed)"
      continue
    fi
    gh skill install "$repo" "$path" --agent claude-code --scope user ${pin:+--pin "$pin"}
    echo "skill: $name ($repo)"
  done < "$list"
fi

# 自作の skill: 自分のリポジトリを clone して、skills/<名前>/ を ~/.claude/skills/<名前> にリンクする
# 編集をすぐ反映させたいので、gh skill のコピーではなくリンクにする
OWN_REPO="QwerTayu/personal-agent-skills"
OWN_DIR="$HOME/Documents/personal/personal-agent-skills"
if [ ! -d "$OWN_DIR" ] && command -v gh >/dev/null 2>&1; then
  mkdir -p "$(dirname "$OWN_DIR")"
  gh repo clone "$OWN_REPO" "$OWN_DIR"
fi
if [ -d "$OWN_DIR/skills" ]; then
  for dir in "$OWN_DIR"/skills/*/; do
    [ -f "$dir/SKILL.md" ] || continue
    name="$(basename "$dir")"
    target="$SKILLS/$name"
    if [ -e "$target" ] && [ ! -L "$target" ]; then
      echo "skill: $name (skip: $target は普通のフォルダ)"
      continue
    fi
    ln -sfn "${dir%/}" "$target"
    echo "skill: $name (link → $OWN_REPO)"
  done
fi
