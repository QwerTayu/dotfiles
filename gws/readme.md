# gws（Google Workspace CLI）の使い方

gws は Drive・Gmail・Calendar・Sheets・Docs などを読み書きする CLI（`brew "googleworkspace-cli"`）。
Claude Code からは Bash で `gws ...` を実行すれば読めるので、MCP は使わない。
Google 公式のサポート対象ではない（README に「not an officially supported Google product」とある）。

## 仕組み

- **ディレクトリごとに Google アカウントを分ける。** gws は `GOOGLE_WORKSPACE_CLI_CONFIG_DIR` の設定ディレクトリにログイン情報を置く。
  アカウントごとに設定ディレクトリを分け、使うディレクトリの `mise.local.toml` の `[env]` で切り替える。
  `mise.local.toml` はそのディレクトリの下のサブディレクトリにも効く。どこにも当てはまらなければ既定の `~/.config/gws` になる。

  ```toml
  # ~/Documents/work/mise.local.toml
  [env]
  GOOGLE_WORKSPACE_CLI_CONFIG_DIR = "{{env.HOME}}/.config/gws-work"
  ```

- **`gws.sh` を通して呼ぶ。** mise は `--shims` で有効にしているので（`bash/bash_profile`）、brew で入れた gws には `[env]` が渡らない。
  `gws.sh` を `~/.local/bin/gws` にリンクし（`setup.sh`）、`mise exec -- /opt/homebrew/bin/gws` で呼ぶ。
  `~/.local/bin` は PATH の先頭なので、ターミナルでも Claude の Bash でも、`gws` と打てばこれが使われる。
- **アカウントは gws を実行したときのカレントディレクトリで決まる。** Claude を起動したディレクトリではない。
  Claude が scratchpad や `/tmp` に移動してから実行すると既定のアカウントになり、検索が空になる（実際に起きた）。
  そのため `claude/CLAUDE.md` に、リポジトリの中で実行するよう書いてある。
- **ログイン情報は暗号化される。** 設定ディレクトリの `credentials.enc` に入り、鍵は macOS のキーチェーンに入る。
  アカウントを増やしても、キーチェーンで混ざらないことを確かめてある。
- **Claude Code の権限**（`claude/settings.json` の `permissions`）
  - `deny`: `gws auth export`（復号した認証情報を出力する）、`~/.config/gws*/**` と `client_secret*.json` の読み取り
  - `ask`: 送信・返信・転送・削除・ゴミ箱・メンバーの除外・ログアウト
  - `Read` の `deny` は Bash の `cat` までは止めない。中身は暗号化されているので実害は小さい。

## Google Cloud の準備（最初の 1 回だけ）

OAuth クライアントは 1 つあれば、どのアカウントでもログインできる。クライアントが表すのは「どのアプリか」で、読めるのはログインしたアカウントのデータ。
以下では、プロジェクトを作るアカウントを `owner@example.com`、gws でログインするアカウントを `sample@example.com` とする。

1. **プロジェクトを作る。** `owner@example.com` で https://console.cloud.google.com/projectcreate を開く（名前は `gws-cli` など）。
2. **API を有効にする。**「API とサービス」→「ライブラリ」で、使うものを有効にする。
   - Google Drive API・Gmail API・Google Calendar API・Google Sheets API・Google Docs API・Google Slides API・Google Tasks API
   - 有効にしないと、ログインは通っても `403 accessNotConfigured` になる。
   - 「認証情報の作成が必要になる場合があります」と出るが、どの API でも出る案内なので無視してよい。認証情報は 4 で作る。
3. **OAuth 同意画面を作る。**「Google Auth Platform」で「ブランディングの作成」に進む。
   - アプリ名: `gws-cli` など（ログインの同意画面に出るだけ）
   - ユーザー サポートメール・連絡先情報: `owner@example.com`（Google からの連絡先。ログインするアカウントとは関係ない）
   - 対象: **外部**（「内部」にすると組織のアカウントしかログインできない）
   - 「外部」でも誰でも使えるわけではない。**「テスト中」のままにし、「アプリを公開」は押さない。** テストユーザー以外はログインできない。
4. **OAuth クライアントを作る。**「クライアント」→「クライアントを作成」。
   - アプリケーションの種類: **デスクトップ アプリ**
   - 「Use this client for an AI-powered agent」: チェックしない（gws のログインはなくても動く）
   - 作成したら **JSON をダウンロードする**（シークレットは作った直後にしか取れないことがある）。
   - スコープは「データアクセス」で足さなくてよい。`gws auth login` が指定する。

## アカウントを足すとき

オーナー以外のアカウントには、**次の 2 つの両方** が要る。役割が違うので、片方だけでは使えない。

| 設定 | 許可すること | 足りないときの症状 |
|---|---|---|
| 「Google Auth Platform」→「対象」→「テストユーザー」に `sample@example.com` を追加 | このアプリにログインして許可を出すこと | ログインで「アクセスがブロックされました」 |
| 「IAM と管理」→「IAM」→「アクセスを許可」で `sample@example.com` に **Service Usage コンシューマー**（`roles/serviceusage.serviceUsageConsumer`） | API を呼び、使用量をこのプロジェクトに付けること | ログインは通るが、API で `403 Caller does not have required permission to use project ...` |

IAM のロールは反映まで数分かかることがある。そのあと、Mac 側で設定ディレクトリを作ってログインする。

```sh
mkdir -p ~/.config/gws-work
cp ~/.config/gws/client_secret.json ~/.config/gws-work/ && chmod 600 ~/.config/gws-work/client_secret.json

# 使うディレクトリに mise.local.toml を置く（上の「仕組み」の例）
mise trust ~/Documents/work/mise.local.toml

cd ~/Documents/work && gws auth login --readonly   # ブラウザで sample@example.com を選ぶ
```

- herdr の worktree は `~/.herdr/worktrees/<repo>/` にでき、元のディレクトリの外になる。worktree でも使うなら、そこにも `mise.local.toml` を置く。
- 大学や会社の Google Workspace のアカウントは、管理者が外部アプリを止めているとログインで弾かれる。

## 新しい Mac で使うとき

1. `brew bundle --file=homebrew/Brewfile` で gws を入れ、`./setup.sh` で `~/.local/bin/gws` のリンクを張る。
2. 「Google Cloud の準備」の 4 でダウンロードした JSON を `~/.config/gws/client_secret.json` に置き、`chmod 600` する。
   JSON をなくしたら、「クライアント」の画面でクライアントにシークレットを足してダウンロードし直す（またはクライアントを作り直す）。
3. 既定のアカウントでログインする。

   ```sh
   gws auth login --readonly
   ```

4. ほかのアカウントは「アカウントを足すとき」の Mac 側の手順をやり直す（Google Cloud 側の設定はそのまま使える）。

## ログインと確認

```sh
gws auth login --readonly                    # 読み取り専用のスコープでログインする（-s drive,gmail で絞れる）
gws auth status                              # user がログイン中のアカウント、client_config が使っている設定ディレクトリ
gws drive files list --params '{"pageSize": 5}' --format table
```

- 「Google はこのアプリを確認していません」と出たら、「詳細」→「（安全ではないページ）に移動」で進む。自分で作ったアプリなので問題ない。
- 同意画面が「テスト中」のままだと、ログインが 7 日ほどで切れることがある。切れたら `gws auth login --readonly` をやり直す。
- 書き込みも必要になったら、`--readonly` を外すか `--scopes` で足してログインし直す（スコープを変えるには再ログインが要る）。
- Claude Code の `!` で `gws auth login` を実行すると、ブラウザでの許可を待つ間に 120 秒を過ぎてバックグラウンドに回るが、そのまま許可すればログインは済む。
