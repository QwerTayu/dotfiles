# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

macOS 用の個人 dotfiles。ビルド・テスト・lint はない。シェルは Homebrew 版 bash（5.x）で、zsh ではない。詳しい手順は `readme.md` を参照。

## 仕組み

- **シンボリックリンク方式**: `setup.sh` の `link <リポジトリ内パス> <$HOME からの相対パス>` が `~` 側にリンクを張る。リンク先に通常ファイルがあれば `.backup` を付けて退避する。何度実行しても安全。
- **ファイル名はドットなし**（`bash/bashrc` → `~/.bashrc`）。ツールごとにフォルダを分ける。将来 Nix / home-manager / nix-darwin に移行しやすくするための方針なので守ること。
- **管理の分担**:
  - シェル・git・VS Code の設定 → このリポジトリ（シンボリックリンク）
  - アプリ・CLI・VS Code 拡張機能 → `homebrew/Brewfile`（`brew bundle dump --file=homebrew/Brewfile --force` で再生成する。手で編集するより dump を優先。dump すると Node 同梱の corepack が `npm "corepack"` として書き出されるので、毎回その行を消す）
  - Finder・Dock などの macOS 設定 → `macos/macos.sh` の `defaults write`
  - VS Code の拡張機能は Brewfile、settings/keybindings/snippets は dotfiles で管理するため、Settings Sync とは競合させない
- **bash の読み込み順**: macOS のターミナルはログインシェルなので `~/.bash_profile` が読まれる。`bash_profile` は Homebrew の PATH とロケールだけを設定して `~/.bashrc` を source する。設定本体は `bashrc` に書く。
- **git の個人情報はコミットしない**: `git/gitconfig` は `~/.gitconfig.local`（`*.local` は gitignore 済み）を `[include]` しており、`user.name` / `user.email` はそちらに置く。`~/.gitconfig.local` は非公開の `~/dotfiles-private`（`git/gitconfig.local`）からリンクしている。

## よく使うコマンド

```sh
./setup.sh                                   # リンクを張る（設定ファイル追加後も再実行）
brew bundle --file=homebrew/Brewfile         # アプリ一括インストール
brew bundle dump --file=homebrew/Brewfile --force   # 現状を Brewfile に書き出す
./macos/macos.sh                             # macOS 設定を反映（Finder/Dock を再起動する）
```

## 開発の進め方

- **main に直接コミットしてよいもの**: `brew install` と Brewfile の更新、設定の値の小さな変更、文書の直し、既存のものの小さな修正。
- **ブランチを切るもの**: 新しく作るもの（mod・スクリプト・skill など）と、既存の mod やスクリプトへの機能の追加。どちらか迷ったら、ユーザーに聞く。
- ブランチはグローバルの CLAUDE.md のとおり worktree で切る（`git worktree add ~/.herdr/worktrees/dotfiles/<branch> -b <branch> origin/main`）。終わったら `gh pr create --assignee @me` で PR を作り、ユーザーがよいと言ってからマージする。マージしたら worktree とブランチを片付ける。

### worktree の mod を Herdr アプリで試す

`~/.config/herdr-app/mods/<mod>/` のファイルは、main のチェックアウト（`~/dotfiles`）にリンクしている。worktree で直している mod を試す間だけ、リンクを worktree に付け替える（`link.js` はリンクできないので写す）。

```sh
src=~/.herdr/worktrees/dotfiles/<branch>/herdr-app/mods/<mod>   # 戻すときは ~/dotfiles/herdr-app/mods/<mod>
dst=~/.config/herdr-app/mods/<mod>
new=0; [ -d "$dst" ] || { new=1; mkdir -p "$dst"; }
for f in "$src"/*; do
  n=$(basename "$f")
  # 今リンクしているものだけ付け替える（新しい mod なら全部リンクする）。setup.sh がリンクしないもの（install-icons.sh など）は増やさない
  if [ "$n" = link.js ]; then cp "$f" "$dst/$n"
  elif [ -L "$dst/$n" ] || [ "$new" = 1 ]; then ln -sfn "$f" "$dst/$n"; fi
done
touch -h "$dst/main.js"   # リンクした main.js は自動で読み直されないので、読み直させる
```

- 付け替えたことは、ユーザーに伝える。マージしたら、同じ手順で `~/dotfiles` に戻す（PR をやめたときも戻す）。
- 新しい mod は、PR の中で `setup.sh` に `link` の行を足しておく。

## 設定ファイルを追加するとき

1. `<ツール名>/<ドットなしのファイル名>` に置く
2. `setup.sh` 末尾に `link <フォルダ>/<ファイル> <.リンク先>` を追加（スペースを含むパスはクォート）
3. `readme.md` の構成図も更新する

## 注意点

- `vscode/snippets/` は空ディレクトリのため git に含まれていない。新しい環境で clone すると `setup.sh` がリンク切れのリンクを作る。スニペットを追加するか `.gitkeep` を置くこと。
- `.gitignore` の `*.baskup` は `*.backup` のタイポと思われる（`setup.sh` が作るのは `~` 側なので実害は小さい）。
- SSH 鍵やトークンなどの認証情報はコミットしない。
- このリポジトリは public。Raycast の書き出し（`.rayconfig`）は非公開の `QwerTayu/dotfiles-private`（`~/dotfiles-private`）に置き、ここには入れない（`.gitignore` 済み）。
