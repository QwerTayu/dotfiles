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
# Herdr アプリは、自分で書くファイルだけをリンクする（同じフォルダに状態のファイルが溜まるため）
link herdr-app/settings.json         .config/herdr-app/settings.json
link herdr-app/themes/dark-modern.json .config/herdr-app/themes/dark-modern.json
link herdr-app/AGENTS.local.md       .config/herdr-app/AGENTS.local.md
# 同梱の spaces を複製して直した mod と、それを使う layout（アプリが書く jsconfig.json などが混ざらないよう、ファイルごとにリンクする）
link herdr-app/mods/spaces-qt/main.js  .config/herdr-app/mods/spaces-qt/main.js
link herdr-app/mods/spaces-qt/mod.json .config/herdr-app/mods/spaces-qt/mod.json
link herdr-app/layouts/qt.json       .config/herdr-app/layouts/qt.json
# 自作の mod: Git Graph（コマンドパレットの「Git Graph」でタブとして開く）
link herdr-app/mods/git-graph/main.js  .config/herdr-app/mods/git-graph/main.js
link herdr-app/mods/git-graph/mod.json .config/herdr-app/mods/git-graph/mod.json
# 自作の mod: Markdown Preview（Marp のスライドも。コマンドパレットの「Markdown Preview」、またはターミナルで mdview）
link herdr-app/mods/md-preview/main.js  .config/herdr-app/mods/md-preview/main.js
link herdr-app/mods/md-preview/mod.json .config/herdr-app/mods/md-preview/mod.json
link herdr-app/mdview.sh             .local/bin/mdview
link mise/config.toml                .config/mise/config.toml
link fresh/config.json               .config/fresh/config.json
link fresh/themes/vscode-dark-modern.json .config/fresh/themes/vscode-dark-modern.json
link fresh/plugins/file_icons.ts     .config/fresh/plugins/file_icons.ts
link lazygit/config.yml              "Library/Application Support/lazygit/config.yml"
link ghostty/config.ghostty          .config/ghostty/config.ghostty
link karabiner                       .config/karabiner   # フォルダごとリンクする（Karabiner はファイルを置き換えて保存するので、ファイルのリンクは切れる）
link homebrew/brew-check.sh          .local/bin/brew-check
link chrome/chrome-window-names.py   .local/bin/chrome-window-names
link gws/gws.sh                      .local/bin/gws

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
  # 未読の印のプラグイン（QwerTayu/herdr-marks-as-unread。他人のプラグインの fork）を clone してあれば登録する
  marks="$HOME/Documents/personal/herdr-marks-as-unread"
  if [ -f "$marks/herdr-plugin.toml" ]; then
    herdr plugin link "$marks" >/dev/null 2>&1 || true
    echo "herdr plugin: herdr-marks-as-unread"
  fi
fi

# Python は uv で管理する（Homebrew の Python は使わない）。uv の Python 3.15 を ~/.local/bin の python / python3 にする
# （Python 製の CLI は Brewfile の uv "..." の行で、brew bundle が uv tool install する）
# ネットワークの不調などで失敗しても、このあとの処理は続ける。
# uv の管理外の ~/.local/bin/python3 が先にあると、uv は警告を出すだけで置き換えないので、出力の警告を見る
if command -v uv >/dev/null; then
  uv python install --default --preview-features python-install-default 3.15 \
    || echo "uv python install に失敗（あとで手で実行する）" >&2
fi

# herdr-core（hc。Herdr アプリが使うターミナルの本体）は Homebrew にないので、公式のインストーラで ~/.local/bin に入れる。
# アプリは Brewfile の cask "herdr-app"。更新するときは、同じインストーラをもう一度実行する。失敗しても、このあとの処理は続ける
if ! command -v herdr-core >/dev/null 2>&1; then
  curl -fsSL https://releases.herdr.dev/core/install.sh | sh \
    || echo "herdr-core のインストールに失敗（あとで手で実行する）" >&2
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
