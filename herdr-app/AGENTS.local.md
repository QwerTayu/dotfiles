# この Mac の Herdr の設定

- 設定は dotfiles（`~/dotfiles/herdr-app/`）で管理していて、`~/dotfiles/setup.sh` がファイルごとにリンクしている。フォルダごとはリンクしない（Herdr が状態のファイルを同じフォルダに書くため）。
  - `settings.json` → `~/dotfiles/herdr-app/settings.json`
  - `themes/dark-modern.json` → `~/dotfiles/herdr-app/themes/dark-modern.json`
  - `AGENTS.local.md`（このファイル）→ `~/dotfiles/herdr-app/AGENTS.local.md`
- リンクしたファイルは、そのまま書き換えてよい（リンク先の dotfiles が変わる）。Herdr がアプリから書き換えても、リンクは切れない（2026-11-26 に確かめた）。
- 新しく設定のファイル（`layouts/<name>.json`、`mods/<name>/`、`keys.json` など）を作ったり書き換えたりするときは、dotfiles に置いて `setup.sh` にリンクを足すかを、ユーザーに確かめる。
- `keys.json` はリンクしていない。一度でも書き換えると、アプリを更新したときに新しい既定のキーが入らなくなるため。
- 色は VS Code の Dark Modern に合わせている（Ghostty・fresh・lazygit と同じ値。`~/dotfiles/readme.md` の「メモ」）。
- herdr-core（`hc`）を、Claude Code の中から起動しない。core が止まっているときに `hc` を打つと、そのセッションの環境変数（`CLAUDE_CODE_CHILD_SESSION` など）を持った core が起動し、アプリで開く claude の会話が保存されなくなる。
