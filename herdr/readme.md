# herdr の使い方

## ワークスペースとタブの分け方

- **ワークスペース 1 つ = git リポジトリ 1 つ。** ワークスペースの名前はリポジトリのフォルダ名にする（例: `QwerTayu`）。
- **タブは役割ごとに分ける。** ふだんは `main` だけを使う。FE・BE・レビュー役など、別の役割の作業が出てきたらタブを足す。
  リポジトリの切り替えにはタブを使わない。
- **グループは見出しのワークスペースで表す。** herdr にはワークスペースをフォルダにまとめる機能がないので、
  `絵文字 + グループ名` のワークスペースを見出しにする（グループのフォルダで開く）。そのすぐ下に、グループのリポジトリのワークスペースを並べる。
  見出しのワークスペースは、グループ全体にまたがる作業に使う。
- **グループの中のリポジトリは、名前の頭に `├─ ` を付ける**（例: `├─ QwerTayu`）。見出しの下に並んでいることを、名前で見えるようにするため。
- **worktree のワークスペースには `├─ ` を付けない。** 名前はブランチを表す短い名前だけにする（例: `ac-notif`）。
  herdr が元のリポジトリのワークスペースの下に字下げして並べるので、`├─ ` を付けると見分けにくくなる。
- **`📁 Documents` は一覧のいちばん上に置く。** すべてのグループにまたがる作業（やることと作業ログの管理）に使う。
  作業フォルダは `~/Documents/task-management-data`（QwerTayu/task-management-data。private）で、そこから `~/Documents` 全体を読める。

```
📁 Documents                 ~/Documents/task-management-data（グループをまたぐ作業）
🛠️ dotfiles                  ~/dotfiles（グループに入らないリポジトリ）
🥜 NUTMEG                    ~/Documents/nutmeg
├─ group-manager-2           ~/Documents/nutmeg/group-manager-2
gm-2123                      ~/.herdr/worktrees/group-manager-2/<ブランチ>（worktree）
💻 Personal                  ~/Documents/personal
├─ QwerTayu                  ~/Documents/personal/QwerTayu
├─ miruomo-portfolio         ~/Documents/personal/miruomo-portfolio
…
```

## リポジトリのワークスペースを足すとき

1. リポジトリのフォルダでワークスペースを作る（名前はフォルダ名。グループの中なら頭に `├─ ` を付ける）。

   ```sh
   herdr workspace create --cwd ~/Documents/personal/foo --label '├─ foo'
   ```

   プラグイン `dev-layout` が、左に claude、右上に fresh と lazygit、右下にターミナルを並べ、タブの名前を `main` にする。
2. 新しいワークスペースは一覧の最後に入るので、グループの位置へ動かす。
   herdr には並べ替えのキーも CLI もないため、ソケットに `workspace.move` を直接送る（`insert_index` は 0 から数えた移動先の位置）。

   ```sh
   herdr workspace list   # 動かすワークスペースの ID（wM など）と、今の並びを確かめる
   printf '{"id":"1","method":"workspace.move","params":{"workspace_id":"wM","insert_index":7}}\n' \
     | nc -U -w 2 ~/.config/herdr/herdr.sock
   ```

   いくつかをまとめて動かすときは、`workspace.move_block` を使う。動かす ID を並べたい順に書き、移動先の直後に来るワークスペースを `before_workspace_id` にする。

   ```sh
   printf '{"id":"1","method":"workspace.move_block","params":{"workspace_ids":["wG","wH"],"before_workspace_id":"wA"}}\n' \
     | nc -U -w 2 ~/.config/herdr/herdr.sock
   ```

## プラグイン（`plugins/`）

`setup.sh` が `herdr plugin link` で登録する。

- `dev-layout/`: 新しいワークスペースを claude / fresh / lazygit / ターミナルの並びにする。既存のタブでは `prefix+shift+l` で同じ並びにする。fresh は `fresh-trusted.sh` 経由で起動するので、初めてのディレクトリでも「このフォルダを信頼しますか」は出ない（claude の確認はそのまま出る）。
  herdr を起動し直すと（Mac の再起動後など）ペインの並びは戻るが中のプロセスは戻らないので、起動時（`[[startup]]`）にこの並びのタブすべての右上で fresh と lazygit を起動し直す。並びの形（左に 1 つ、右上に 2 つ、右下に 1 つ）だけで見分けるので、右上で別のものを使っていたタブも fresh と lazygit になる。手で起こすときは `dev-layout/apply-layout.sh restore`。claude は herdr の連携が `claude --resume` で戻す。
- `ascii-input-source/`: lazygit などのペインに移ったとき、入力ソースを英字にする。

dotfiles の外のプラグイン:

- **herdr-marks-as-unread**（`QwerTayu/herdr-marks-as-unread`。sachin-philip/herdr-marks-as-unread の fork）: `prefix+m` で、今のエージェントのサイドバーの行に緑の `●`（未読の印）を付ける・外す。
  そのペインに戻ると消える。herdr の done / idle の状態は変えない（herdr には「未読に戻す」機能がないための代わり）。
  `~/Documents/personal/herdr-marks-as-unread` に clone しておくと `setup.sh` が登録する。印の行（`$herdr_mark`）とキーの割り当ては `config.toml` に書いてある。
  付属のセットアップ（`local.herdr-marks.setup`）は使わない。

skill などからタブを足すときは、`dev-layout/apply-layout.sh tab <ペイン ID> <タブ名> [<コマンド>]` で同じ並びにする。
渡したペインを左に残し、左で `<コマンド>` を起動して、タブの名前を `<タブ名>` にする（`<コマンド>` を省くと何も起動しない）。

```sh
pane=$(herdr tab create --workspace wM --cwd ~/Documents/personal/foo --label Review --no-focus | grep -o '"pane_id": *"[^"]*"' | head -1 | cut -d'"' -f4)
~/dotfiles/herdr/plugins/dev-layout/apply-layout.sh tab "$pane" Review "claude --name review-foo"
```
