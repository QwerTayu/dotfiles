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
