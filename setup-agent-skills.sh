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

# Herdr アプリと herdr-core: 公式の説明書を本体が出力する。出力に frontmatter がないので、名前と説明を先頭に足して skill にする
# （core が止まっているときに hc --skill が core を起動するかは確かめていない。claude の中から実行するときは、先に Herdr アプリを開いておく）
write_skill() {  # 使い方: write_skill <名前> <説明> <コマンド...>
  local name="$1" desc="$2"
  shift 2
  mkdir -p "$SKILLS/$name"
  { printf -- '---\nname: %s\ndescription: "%s"\n---\n\n' "$name" "$desc"; "$@"; } > "$SKILLS/$name/SKILL.md"
  echo "skill: $name ($*)"
}
if command -v herdr-app >/dev/null 2>&1; then
  write_skill herdr-app "Drive the Herdr desktop app window: spaces, tabs, panes, layouts, keys and mods. Use when the user mentions the Herdr app or asks to change what the Herdr window shows. For starting, reading or messaging terminals and agents, use the herdr-core skill (hc). Not for the older herdr TUI (the herdr skill)." herdr-app --skill
fi
if command -v hc >/dev/null 2>&1; then
  write_skill herdr-core "Run and control persistent terminals and coding agents with hc (herdr-core), the core behind the Herdr app: run, ls, get, read, send, wait, keys, attach. Use when the user mentions hc, herdr-core or the Herdr app's terminals and agents. Not for the older herdr TUI (the herdr skill)." hc --skill
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
