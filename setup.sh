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
link bash/bash_profile        .bash_profile
link bash/bashrc              .bashrc
link git/gitconfig            .gitconfig
link vscode/settings.json     "Library/Application Support/Code/User/settings.json"
link vscode/keybindings.json  "Library/Application Support/Code/User/keybindings.json"
link vscode/snippets          "Library/Application Support/Code/User/snippets"
