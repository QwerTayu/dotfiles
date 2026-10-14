# herdr の使い方

## ワークスペースとタブの分け方

- **ワークスペース 1 つ = git リポジトリ 1 つ。** ワークスペースの名前はリポジトリのフォルダ名にする（例: `QwerTayu`）。
- **タブは役割ごとに分ける。** ふだんは `main` だけを使う。FE・BE・レビュー役など、別の役割の作業が出てきたらタブを足す。
  リポジトリの切り替えにはタブを使わない。
- **グループは見出しのワークスペースで表す。** herdr にはワークスペースをフォルダにまとめる機能がないので、
  `絵文字 + グループ名` のワークスペースを見出しにする（グループのフォルダで開く）。そのすぐ下に、グループのリポジトリのワークスペースを並べる。
  見出しのワークスペースは、グループ全体にまたがる作業に使う。

```
🛠️ dotfiles                  ~/dotfiles（グループに入らないリポジトリ）
🥜 NUTMEG                    ~/Documents/nutmeg
group-manager-2              ~/Documents/nutmeg/group-manager-2
💻 Personal                  ~/Documents/personal
QwerTayu                     ~/Documents/personal/QwerTayu
miruomo-portfolio            ~/Documents/personal/miruomo-portfolio
…
```

## リポジトリのワークスペースを足すとき

1. リポジトリのフォルダでワークスペースを作る（名前はフォルダ名）。

   ```sh
   herdr workspace create --cwd ~/Documents/personal/foo --label foo
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

- `dev-layout/`: 新しいワークスペースを claude / fresh / lazygit / ターミナルの並びにする。既存のタブでは `prefix+shift+l` で同じ並びにする。
- `ascii-input-source/`: lazygit などのペインに移ったとき、入力ソースを英字にする。

skill などからタブを足すときは、`dev-layout/apply-layout.sh tab <ペイン ID> <タブ名> [<コマンド>]` で同じ並びにする。
渡したペインを左に残し、左で `<コマンド>` を起動して、タブの名前を `<タブ名>` にする（`<コマンド>` を省くと何も起動しない）。

```sh
pane=$(herdr tab create --workspace wM --cwd ~/Documents/personal/foo --label Review --no-focus | grep -o '"pane_id": *"[^"]*"' | head -1 | cut -d'"' -f4)
~/dotfiles/herdr/plugins/dev-layout/apply-layout.sh tab "$pane" Review "claude --name review-foo"
```
