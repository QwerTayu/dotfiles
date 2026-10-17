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

# herdr

- herdr でワークスペースやタブを作る・並べ替える前に、`~/dotfiles/herdr/readme.md` を読む。名前の付け方、グループの表し方（見出しのワークスペース）、`workspace.move` での並べ替え、`dev-layout` プラグインによるペインの並びが書いてある。
- herdr の中でブランチを切るときは、main のチェックアウトで `git switch -c` せず、git worktree も一緒に切る。`herdr worktree create --workspace <元 repo のワークスペース ID> --branch <ブランチ名> --base main --label <短い名前> --no-focus` で worktree とワークスペースを作る（worktree は `~/.herdr/worktrees/<repo>/<branch>` にできる）。作ったワークスペースは、`workspace.move` で今アクティブなワークスペースのすぐ下に動かす。
- セルフレビューや敵対的評価を頼まれたとき、code-review / security-review を使う前に、skill `review-in-tab` に従う。
