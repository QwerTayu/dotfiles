#!/bin/bash
set -eu
DOTFILES="$(cd "$(dirname "$0")" && pwd)"

link() {
  local src="$DOTFILES/$1" dst="$HOME/$2"
  mkdir -p "$(dirname "$dst")"
  # 既存の普通のファイルがあればバックアップしてlogに出力
  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    mv "$dst" "$dst.backup"
    echo "backup: $dst -> $dst.backup"
  fi
  ln -sfn "$src" "$dst"
  echo "link: $dst -> $src"
}

# ここにリンクを追加していく
link bash/bash_profile               .bash_profile
link bash/bashrc                     .bashrc
link git/gitconfig                   .gitconfig
link vscode/settings.json            "Library/Application Support/Code/User/settings.json"
link vscode/keybindings.json         "Library/Application Support/Code/User/keybindings.json"
link vscode/snippets                 "Library/Application Support/Code/User/snippets"
link claude/settings.json            .claude/settings.json
link claude/CLAUDE.md                .claude/CLAUDE.md
link herdr/config.toml               .config/herdr/config.toml
link fresh/config.json               .config/fresh/config.json
link fresh/themes/vscode-dark-modern.json .config/fresh/themes/vscode-dark-modern.json
link lazygit/config.yml              "Library/Application Support/lazygit/config.yml"
link ghostty/config.ghostty          .config/ghostty/config.ghostty

# 1Password CLI の補完を書き出す（bashrc で毎回 op を動かさないため。op を更新したら setup.sh を実行し直す）
if command -v op >/dev/null; then
  mkdir -p "$HOME/.local/share/bash-completion/completions"
  op completion bash > "$HOME/.local/share/bash-completion/completions/op"
  echo "completion: ~/.local/share/bash-completion/completions/op"
fi

# Claude Code の skill を入れる（~/.claude/skills/ の中身は dotfiles に入れない）
"$DOTFILES/setup-agent-skills.sh"
