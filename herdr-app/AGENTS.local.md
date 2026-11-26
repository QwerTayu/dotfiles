# この Mac の Herdr の設定

- 設定は dotfiles（`~/dotfiles/herdr-app/`）で管理していて、`~/dotfiles/setup.sh` がファイルごとにリンクしている。フォルダごとはリンクしない（Herdr が状態のファイルを同じフォルダに書くため）。
  - `settings.json` → `~/dotfiles/herdr-app/settings.json`
  - `themes/dark-modern.json` → `~/dotfiles/herdr-app/themes/dark-modern.json`
  - `AGENTS.local.md`（このファイル）→ `~/dotfiles/herdr-app/AGENTS.local.md`
  - `mods/spaces-qt/main.js`・`mod.json` → `~/dotfiles/herdr-app/mods/spaces-qt/`（同梱の `spaces` の複製。`├─ ` で始まる space はグレーに頭文字、それ以外は見出しとして青の 📂 をアバターにする。見出しの space の名前には絵文字を付けない）
  - `mods/git-graph/main.js`・`mod.json` → `~/dotfiles/herdr-app/mods/git-graph/`（自作。今の space のリポジトリの履歴を枝の線つきで出す。コマンドパレットの「Git Graph」でタブとして開く。lazygit の代わり）
  - `mods/md-preview/main.js`・`mod.json` → `~/dotfiles/herdr-app/mods/md-preview/`（自作。Markdown を整形して出す。Marp は marp-cli で PNG にして、1 枚ずつ／縦に並べて見せる。ターミナルからは `mdview <ファイル>`）
  - `mods/files-qt/main.js`・`mod.json` → `~/dotfiles/herdr-app/mods/files-qt/`（同梱の `files` の複製。Material Icon Theme のアイコンを付ける。アイコンと表は `install-icons.sh` が入れ、dotfiles には入れない）
  - `mods/tabs-qt/main.js`・`mod.json` → `~/dotfiles/herdr-app/mods/tabs-qt/`（同梱の `tabs` の複製。右上に Git Graph のパネルのボタン「Graph」を足す）
  - `layouts/qt.json` → `~/dotfiles/herdr-app/layouts/qt.json`（同梱の `main` の複製で、サイドバーを `spaces-qt`、タブバーを `tabs-qt` にし、右のパネルに Git Graph を足したもの。ふだん使う layout）
- リンクした mod のファイルを dotfiles 側で書き換えても、アプリは読み直さない（リンク先の変更に気づかない）。書き換えたら `touch -h ~/.config/herdr-app/mods/<名前>/main.js` でリンクの時刻を変えて読み直させる（2026-11-26 に確かめた）。
- 同梱の `spaces`・`tabs`・`files`・`main` は直接いじらない。直すときは `spaces-qt`・`tabs-qt`・`files-qt`・`qt` を直す。複製した元の版は `~/dotfiles/herdr-app/upstream.json` に控えてあり、`~/dotfiles/herdr-app/check-upstream.sh` が毎日比べて、変わったら通知する。
- リンクしたファイルは、そのまま書き換えてよい（リンク先の dotfiles が変わる）。Herdr がアプリから書き換えても、リンクは切れない（2026-11-26 に確かめた）。
- 新しく設定のファイル（`layouts/<name>.json`、`mods/<name>/`、`keys.json` など）を作ったり書き換えたりするときは、dotfiles に置いて `setup.sh` にリンクを足すかを、ユーザーに確かめる。
- `keys.json` はリンクしていない。一度でも書き換えると、アプリを更新したときに新しい既定のキーが入らなくなるため。
- ターミナルの字体は UDEV Gothic NF（Brewfile の `font-udev-gothic-nf`）。HackGen Console NF は ⌘ ⇧ ① などのあいまいな幅の文字を全角で描き、Claude Code の 1 マスからはみ出して重なったため替えた（2026-11-26）。UDEV Gothic はこれらを 1 マスに収める。
- 色は VS Code の Dark Modern に合わせている（Ghostty・fresh・lazygit と同じ値。`~/dotfiles/readme.md` の「メモ」）。
- herdr-core（`hc`）を、Claude Code の中から起動しない。core が止まっているときに `hc` を打つと、そのセッションの環境変数（`CLAUDE_CODE_CHILD_SESSION` など）を持った core が起動し、アプリで開く claude の会話が保存されなくなる。
