# Git

- git の名前とメールアドレスは `~/.gitconfig.local`（非公開の `~/dotfiles-private/git/gitconfig.local` へのリンク）に書いてあり、`~/.gitconfig`（dotfiles の `git/gitconfig`）から `[include]` で読み込んでいる。
- `git config --global user.name` は include 先を読まないので、未設定のように空で返る。確かめるときは次のどちらかを使う。

  ```sh
  git config --global --includes user.name   # QwerTayu
  git config user.name                       # リポジトリの中で実行する
  ```

- メールアドレスも同じで、`~/.gitconfig.local` から gmail のアドレスが読まれる。
- 名前とメールアドレスは Personal（QwerTayu）、Organization ともに共通。
- `gh pr create` で PR を作るときは、ほかに指示がなければ `--assignee @me` を付けて自分（QwerTayu）を assign する。

# Python

- Python は uv で管理する。`python3` は uv の Python（`~/.local/bin/python3`）で、Homebrew の Python は入れない。更新は `uv python upgrade`。
- Python 製の CLI は `uv tool install` で入れる。`brew bundle dump` で Brewfile に `uv "..."` の行として書き出され、新しい Mac では `brew bundle` が入れる。
- `brew install` する前に `brew deps <名前> | grep '^python@'` で確かめる。Homebrew の Python が依存で入るなら、入れる前にユーザーに伝え、uv tool で入れられないかを提案する。

# gws

- `gws`（`~/.local/bin/gws`）は、実行したときのカレントディレクトリの `mise.local.toml` で Google アカウントを切り替える。scratchpad や `/tmp` に移動して実行すると既定のアカウントになり、検索が空になったり別のアカウントのデータを読んだりする。`gws` はリポジトリの中で実行し、ファイルを scratchpad に保存したいときは `--output` に scratchpad のパスを渡す。どのアカウントかは `gws auth status` の `user` で確かめられる。詳しくは `~/dotfiles/gws/readme.md`。

# herdr

- herdr でワークスペースやタブを作る・並べ替える前に、`~/dotfiles/herdr/readme.md` を読む。名前の付け方、グループの表し方（見出しのワークスペース）、`workspace.move` での並べ替え、`dev-layout` プラグインによるペインの並びが書いてある。
- herdr の中でブランチを切るときは、main のチェックアウトで `git switch -c` せず、git worktree も一緒に切る。`herdr worktree create --workspace <元 repo のワークスペース ID> --branch <ブランチ名> --base main --label <短い名前> --no-focus` で worktree とワークスペースを作る（worktree は `~/.herdr/worktrees/<repo>/<branch>` にできる）。`--label` には `├─ ` を付けない（herdr が元のワークスペースの下に字下げして並べるため）。作ったワークスペースは、`workspace.move` で今アクティブなワークスペースのすぐ下に動かす。
- セルフレビューや敵対的評価を頼まれたとき、code-review / security-review を使う前に、skill `review-in-tab` に従う。

# cctag

- [cctag](https://github.com/TMLlaboratory/cctag) は Slack と手元の Claude Code / Codex CLI をつなぐツールで、この Mac では Spoke（`~/.local/bin/cctag-spoke`）を動かす。Hub は `wss://cctag.kumoi.net`。
- 設定は `~/.config/cctag/config.env`（`CCTAG_HUB_URL`・`CCTAG_SPOKE_TOKEN`・`CCTAG_OWNER_USER_ID`・`CCTAG_HERDR_BIN`）にあり、`cctag-spoke` は起動時にこれを自動で読む。環境変数が空でも設定が無いとは判断せず、まずこのファイルを見る。トークンをほかの場所（`.env` など）に複製しない。
- 使えるかを確かめるときは、`ps aux | grep '[c]ctag-spoke'` で Spoke が動いているかを見る。`cctag-spoke --help` はヘルプを出さずに Spoke として起動してしまうので打たない。
- Spoke は 1 つしか動かせない（`~/.cctag/spoke-*.lock` で排他）。起動する前に、ほかで動いていないかを確かめる。
- 起動したら、Slack のスレッドで `@cctag connect` を送って Claude Code が動いているターミナルにつなぐ。

# stack-diagram

- stack-diagram で図を作ったあと、ギャラリーへの共有（Step 7）は提案しない。図は手元で使うだけにする（`share.py submit` は settings.json の `permissions.deny` でも止めている）。
