# Claude Code のアカウントをフォルダごとに分ける

`claude` と打つだけで、起動したフォルダに合わせて、個人のアカウントと TMLlab のチームのアカウントを使い分ける。
設定・skill・会話の履歴・memory は、どちらのアカウントでも共通。

## 仕組み

- **`claude.sh` を通して起動する。** `claude.sh` を `~/.local/bin/claude` にリンクし（`setup.sh`）、brew の `/opt/homebrew/bin/claude` より先に見つかるようにする。
  `gws.sh` と同じやり方。Herdr アプリや hc が PATH から `claude` を探して起動するときも、これを通る。
- **アカウントは、起動したフォルダの `mise.local.toml` で決める。** `[env]` の `CLAUDE_ACCOUNT` が `"me"` なら個人、
  `"lab"` か、書いていなければ TMLlab。ほかの値はエラーにする。
  `mise.local.toml` はサブフォルダにも効き、近いフォルダの値が勝つ。ファイルは dotfiles に入れていない。
  - `me`: `~/Documents/personal`（個人のリポジトリ）だけ。
  - `lab`（書いてある）: `~/Documents/TMLlaboratory`（研究室）・`~/Documents/nutmeg`（NUTMEG の開発）・`~/Documents/nut`（大学）。
    既定と同じだが、どこを TMLlab にしているかがわかるように書いておく。
  - 書いていない（TMLlab）: `~/dotfiles`・`~/Documents/task-management-data`・`~` など、それ以外のすべて。

  ```toml
  # ~/Documents/personal/mise.local.toml
  [env]
  CLAUDE_ACCOUNT = "me"
  ```

  新しく作った `mise.local.toml` は、`mise trust` するまで読まれず、書いていないのと同じ（TMLlab）になる。
  読むときは、足りないツールを入れないようにしている（`MISE_EXEC_AUTO_INSTALL=0`）。mise が失敗したときは、警告を出して TMLlab で起動する。
- **worktree の中では、元のリポジトリの設定を読む。** worktree は `~/.herdr/worktrees/<repo>/<branch>` にあり、上のフォルダの外になるため。
  元のリポジトリは `git rev-parse --git-common-dir` で探す。
- **TMLlab は、設定フォルダを `~/.claude-tmllab` に分ける**（`CLAUDE_CONFIG_DIR`）。個人は、ふだんどおり `~/.claude`。
  どちらも `/login` で入るので、claude.ai のコネクタ（Gmail・Calendar・Claude Docs など）が使え、ログイン情報も自動で更新される。
  - `setup-token` のトークン（`CLAUDE_CODE_OAUTH_TOKEN`）で入る方法は、claude.ai のコネクタが読み込まれなかったのでやめた。
  - `/login` で 1 つのログイン情報を切り替える方法は、上書きされて戻すたびにログインし直すことになるので使わない。
- **`~/.claude-tmllab` の中身の多くは、`~/.claude` へのリンク。** `claude.sh` が、TMLlab で起動するたびに張る（足りなければ足す）。
  - リンクするもの: `CLAUDE.md`・`settings.json`・`statusline.sh`・`keybindings.json`・`history.jsonl`（入力の履歴）・`paste-cache`（その中の貼り付けの本文）・
    `projects`（会話の履歴と memory）・`plans`・`file-history`・`rules`・`skills`・`plugins`・`agents`・`commands`・`output-styles`・`agent-memory`
  - フォルダのもの（`projects` など）は、`~/.claude` にまだなければ作ってからリンクする。TMLlab の側で先に作られると、分かれてしまうため。
    ファイル（`keybindings.json` など）は、`~/.claude` にあるときだけリンクする。
  - リンクしないもの: ログイン情報、組織ごとの設定（`policy-limits.json`・`remote-settings.json`）、動いている間の状態（`sessions`・`daemon` など）、キャッシュ
  - リンクは、`~/.claude` の先（dotfiles など）まで辿った行き着く先に張る。リンクのリンクにしたとき、TMLlab の claude が設定を書いて、
    `~/.claude/settings.json`（dotfiles へのリンク）をふつうのファイルに置き換えたことがあるため。
  - リンクのはずの所にふつうのファイルがあると、`claude.sh` は警告を出して、そのファイルを残す。
    中身を `~/.claude` の同じ名前のものに移してから消し、もう一度起動すると、リンクに戻る。
- **自分で足した MCP は、`~/.claude.json` から写す。** `~/.claude.json` の `mcpServers` は、ログインしているアカウントの情報と同じファイルにあるのでリンクできない。
  `claude.sh` が TMLlab で起動するたびに、`~/.claude-tmllab/.claude.json` の `mcpServers` を `~/.claude.json` と同じにする。
  MCP を足すときは、個人のフォルダ（`~/Documents/personal` の下）で `claude mcp add --scope user` する。
  - TMLlab の側で足した MCP は、次に起動したときに消える。
  - OAuth で入る MCP（Slack など）のログインは、アカウントごとに別。TMLlab の側でも 1 回ずつ入り直す。
  - フォルダごとの設定（`.claude.json` の `projects`。フォルダを信頼するかどうかなど）は写さないので、TMLlab の側でもう一度聞かれる。
- **1 回だけ別のアカウントで起動するときは、`--me` か `--lab` を付ける。** フォルダの設定より優先される。
  片方の利用上限に達して、リセットされるまでもう片方で続けたいときなど（どちら向きでも使える）。

  ```sh
  claude --me              # TMLlab のフォルダで、個人のアカウントで新しく始める
  claude --me --resume     # 今の会話を個人で続ける（/exit してから、同じフォルダで）
  claude --lab --resume    # 個人のフォルダの会話を、TMLlab で続ける
  ```

  この 2 つは `claude.sh` が取り除いてから claude に渡す（`--` より後ろは見ない）。
  引数がまるごと `--me` / `--lab` なら、どこにあっても取り除くので、プロンプトとして `--me` だけを渡したいときは `claude -- --me` と打つ。その claude にだけ効き、claude の中で動くコマンドには伝わらない。
  Herdr アプリが agent を開き直すとき（`claude --resume <ID>`）も付かないので、フォルダのアカウントに戻る。
  `/login` で入り直しても切り替えられるが、`~/.claude-tmllab` のログイン情報が上書きされ、戻すときにまたログインし直すことになるので使わない。
- **アカウントが決まるのは起動したときだけ。** 動いている claude の中でフォルダを移っても変わらない。
  切り替えたいときは `/exit` して、別のフォルダで起動し直す（会話を続けるなら `claude --resume`。会話の一覧はフォルダごとなので、元のフォルダで打つ）。

## TMLlab のアカウントに入る（最初の 1 回だけ）

1. `~/Documents/nutmeg` など、TMLlab のフォルダで `claude` を起動する。
2. `/login` を打ち、TMLlab のアカウントで入る。ログイン情報は `~/.claude-tmllab` の側に入り、個人のログイン情報は変わらない。
3. `/status` で組織を、`/mcp` で claude.ai のコネクタが出ているかを見る。
