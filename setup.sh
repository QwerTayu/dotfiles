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
link fresh/plugins/file_icons.ts     .config/fresh/plugins/file_icons.ts
link lazygit/config.yml              "Library/Application Support/lazygit/config.yml"
link ghostty/config.ghostty          .config/ghostty/config.ghostty
link homebrew/brew-check.sh          .local/bin/brew-check
link marp/marp-preview.sh            .local/bin/marp-preview

# 1Password CLI の補完を書き出す（bashrc で毎回 op を動かさないため。op を更新したら setup.sh を実行し直す）
if command -v op >/dev/null; then
  mkdir -p "$HOME/.local/share/bash-completion/completions"
  op completion bash > "$HOME/.local/share/bash-completion/completions/op"
  echo "completion: ~/.local/share/bash-completion/completions/op"
fi

# 毎日 10:00 に Homebrew の更新を確かめて通知する launchd のジョブを登録する
# （plist はリンクではなくコピー。plist を変えたら setup.sh を実行し直す）
PLIST="$HOME/Library/LaunchAgents/com.qwertayu.brew-check.plist"
mkdir -p "$(dirname "$PLIST")"
cp "$DOTFILES/launchd/com.qwertayu.brew-check.plist" "$PLIST"
launchctl bootout "gui/$(id -u)/com.qwertayu.brew-check" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "launchd: com.qwertayu.brew-check"

# Claude Code の skill を入れる（~/.claude/skills/ の中身は dotfiles に入れない）
"$DOTFILES/setup-agent-skills.sh"
