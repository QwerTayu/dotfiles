# Git

- git の名前とメールアドレスは `~/.gitconfig.local` に書いてあり、`~/.gitconfig`（dotfiles の `git/gitconfig`）から `[include]` で読み込んでいる。
- `git config --global user.name` は include 先を読まないので、未設定のように空で返る。確かめるときは次のどちらかを使う。

  ```sh
  git config --global --includes user.name   # QwerTayu
  git config user.name                       # リポジトリの中で実行する
  ```

- メールアドレスも同じで、`~/.gitconfig.local` から gmail のアドレスが読まれる。
- 名前とメールアドレスは Personal（QwerTayu）、Organization ともに共通。
