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
link claude/statusline.sh            .claude/statusline.sh
link herdr/config.toml               .config/herdr/config.toml
link mise/config.toml                .config/mise/config.toml
link fresh/config.json               .config/fresh/config.json
link fresh/themes/vscode-dark-modern.json .config/fresh/themes/vscode-dark-modern.json
link fresh/plugins/file_icons.ts     .config/fresh/plugins/file_icons.ts
link lazygit/config.yml              "Library/Application Support/lazygit/config.yml"
link ghostty/config.ghostty          .config/ghostty/config.ghostty
link homebrew/brew-check.sh          .local/bin/brew-check
link marp/marp-preview.sh            .local/bin/marp-preview
link chrome/chrome-window-names.py   .local/bin/chrome-window-names

# 1Password CLI の補完を書き出す（bashrc で毎回 op を動かさないため。op を更新したら setup.sh を実行し直す）
if command -v op >/dev/null; then
  mkdir -p "$HOME/.local/share/bash-completion/completions"
  op completion bash > "$HOME/.local/share/bash-completion/completions/op"
  echo "completion: ~/.local/share/bash-completion/completions/op"
fi

# launchd のジョブを登録する（brew-check: 毎日 10:00 に Homebrew の更新を通知、
# chrome-window-names: 30 秒ごとに Chrome のウィンドウへ profile 名を付ける）
# （plist はリンクではなくコピー。plist を変えたら setup.sh を実行し直す）
mkdir -p "$HOME/Library/LaunchAgents"
for src in "$DOTFILES"/launchd/*.plist; do
  label="$(basename "$src" .plist)"
  PLIST="$HOME/Library/LaunchAgents/$label.plist"
  cp "$src" "$PLIST"
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  echo "launchd: $label"
done

# herdr のプラグインを登録する（登録は herdr が持つので、新しい環境ではここで登録し直す）
if command -v herdr >/dev/null; then
  for plugin in "$DOTFILES"/herdr/plugins/*/; do
    herdr plugin link "$plugin" >/dev/null 2>&1 || true
    echo "herdr plugin: $(basename "$plugin")"
  done
fi

# Claude Code の skill を入れる（~/.claude/skills/ の中身は dotfiles に入れない）
"$DOTFILES/setup-agent-skills.sh"

# SwiftBar（メニューバーにスクリプトの出力を出すアプリ）のプラグインは ~/.config/swiftbar に置く
mkdir -p "$HOME/.config/swiftbar"
defaults write com.ameba.SwiftBar PluginDirectory "$HOME/.config/swiftbar"
echo "swiftbar: plugins in ~/.config/swiftbar"

# localhost のポート一覧の SwiftBar プラグイン（QwerTayu/swiftbar-ports）を clone してあれば、リンクを張る
if [ -x "$HOME/Documents/personal/swiftbar-ports/install.sh" ]; then
  "$HOME/Documents/personal/swiftbar-ports/install.sh"
fi

# 非公開の dotfiles（QwerTayu/dotfiles-private）を clone してあれば、そちらのリンクも張る
if [ -x "$HOME/dotfiles-private/setup.sh" ]; then
  "$HOME/dotfiles-private/setup.sh"
fi
