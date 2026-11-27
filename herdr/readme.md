# Herdr アプリの使い方

ターミナルは Herdr アプリ（画面の `herdr-app` と、ターミナルを動かし続ける herdr-core の `hc`）を使う。
herdr の TUI は 2026-11-26 にやめた。TUI のころの設定（`config.toml`・plugin・この readme の TUI の決まり）は、ブランチ `herdr-tui` に残してある。
アプリの設定は `~/dotfiles/herdr-app/`（`readme.md` の構成図）、agent への決まりは `herdr-app/AGENTS.local.md`。

## space とタブの分け方

- **space 1 つ = git リポジトリ 1 つ。** space の名前はリポジトリのフォルダ名にする（例: `QwerTayu`）。
- **タブは役割ごとに分ける。** ふだんは `main` だけを使う。FE・BE・レビュー役など、別の役割の作業が出てきたらタブを足す。
  リポジトリの切り替えにはタブを使わない。
- **グループは見出しの space で表す。** アプリには space をフォルダにまとめる機能がない（サイドバーでまとまるのはマシンごとだけ）ので、
  グループ名の space を見出しにする（グループのフォルダで開く）。そのすぐ下に、グループのリポジトリの space を並べる。
  見出しの space は、グループ全体にまたがる作業に使う。
- **見出しの space の名前には絵文字を付けない**（例: `NUTMEG`、`dotfiles`）。サイドバーの mod `spaces-qt` が、`├─ ` で始まらない space を見出しとして、
  アバターを青の 📂 にする。
- **グループの中のリポジトリは、名前の頭に `├─ ` を付ける**（例: `├─ QwerTayu`）。`spaces-qt` は、グレーのアバターに名前の頭文字を出す。
- **グループは見出しの矢印で開け閉めできる。** 中に `├─ ` の space がある見出しだけに、右端に矢印が出る。閉じると、見出しの名前の後ろに中の space の数（例: `NUTMEG (4)`）が出る。
  閉じていても、いま開いている space は隠れない。開閉の状態は `spaces-qt` が覚えている。細いサイドバー（番号だけ）では折りたたまない。
- **worktree の space には `├─ ` を付けない。** 名前はブランチを表す短い名前だけにする（例: `ac-notif`）。
  アプリが worktree だとわかり、元のリポジトリの space の下に字下げして並べる。worktree の space にはアバターがない。
- **`Documents` は一覧のいちばん上に置く。** すべてのグループにまたがる作業（やることと作業ログの管理）に使う。
  作業フォルダは `~/Documents/task-management-data`（QwerTayu/task-management-data。private）で、そこから `~/Documents` 全体を読める。

```
Documents                    ~/Documents/task-management-data（グループをまたぐ作業）
dotfiles                     ~/dotfiles（グループに入らないリポジトリ）
NUTMEG                       ~/Documents/nutmeg
├─ group-manager-2           ~/Documents/nutmeg/group-manager-2
gm-2123                      ~/.herdr/worktrees/group-manager-2/<ブランチ>（worktree）
Personal                     ~/Documents/personal
├─ QwerTayu                  ~/Documents/personal/QwerTayu
├─ miruomo-portfolio         ~/Documents/personal/miruomo-portfolio
…
```

## space を足す・並べ替える

1. リポジトリのフォルダで space を作る（名前はフォルダ名。グループの中なら頭に `├─ ` を付ける）。

   ```sh
   herdr-app do space.new --name '├─ foo' --folder ~/Documents/personal/foo --focus false
   ```

2. 新しい space は一覧の最後に入るので、グループの位置へ動かす。ID と今の並びは `herdr-app ls` で見る（`index` は 1 から数える）。
   サイドバーのドラッグでも並べ替えられる。

   ```sh
   herdr-app do space.move '{"id":"<space の ID>","index":7}'
   ```

## worktree

`git worktree add ~/.herdr/worktrees/<repo>/<branch> -b <branch> origin/main` で作り、
`herdr-app do space.new --name <短い名前> --folder <worktree> --focus false` で space にする。
アプリの space のメニューの「New worktree」でも作れる（作り先は同じ `~/.herdr/worktrees/<repo>/<branch>`）。

## ペインの並び

TUI のころの `dev-layout`（claude・fresh・lazygit・ターミナルの並び）は作り直していない。
ソースの管理は標準の Changes パネル、コミットの履歴は自作の Git Graph（右上の Graph）、Markdown は自作の md-preview を使う。

## mod を外から動かす

自作の md-preview と git-graph は、マウスで押す操作の一部を、コマンドでもできる（`herdr-app do <mod>.<命令>`）。
スクショを撮るときや、claude に画面を見せながら作業するときに使う。命令の一覧は、各 mod の `main.js` の `command()` の上に書いてある。

```sh
herdr-app do md-preview.scroll       # Marp を縦に並べて見せる（slides で 1 枚ずつ）
herdr-app do md-preview.next         # 次のスライド（prev・first・last）
herdr-app do md-preview.open-2       # 2 番目の折りたたみを開く（close-2・toggle-2・open-all・close-all）
herdr-app do git-graph.select-961bb2b  # そのコミットを選んで、そこまでスクロールする（next・prev・unselect）
herdr-app do git-graph.file-1        # 選んだコミットの 1 番目のファイルの差分を出す（back で一覧に戻る）
herdr-app do git-graph.goto-961bb2b  # 選ばずにスクロールだけする（top・bottom）
```

- 命令は、表示しているその mod のすべてに届く（md-preview を 2 つ開いていれば、どちらも切り替わる）。
- パネルの切り替え（Files・Changes・Graph）とペインの幅は、Herdr のコマンドでできる（`layout.select` と `layout.show`、`pane.resize`）。
