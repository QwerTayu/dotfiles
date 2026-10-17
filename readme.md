# dotfiles

自分のMac環境の設定ファイル。シェルは bash（Homebrew版）。

## 構成

```
dotfiles/
├── bash/
│   ├── bash_profile        → ~/.bash_profile
│   └── bashrc              → ~/.bashrc
├── git/
│   └── gitconfig           → ~/.gitconfig
├── homebrew/
│   ├── Brewfile            アプリ・コマンド・VS Code拡張機能の一覧
│   └── brew-check.sh       → ~/.local/bin/brew-check（更新があれば通知する。launchd が毎日実行）
├── mise/
│   └── config.toml         → ~/.config/mise/config.toml（node・java・marp-cli の版）
├── marp/
│   └── marp-preview.sh     → ~/.local/bin/marp-preview（Marp のスライドを terminal-browser で表示する）
├── chrome/
│   └── chrome-window-names.py → ~/.local/bin/chrome-window-names（Chrome のウィンドウに profile 名を付ける。launchd が 30 秒ごとに実行）
├── launchd/
│   ├── com.qwertayu.brew-check.plist          ~/Library/LaunchAgents/ にコピーして登録する（setup.sh）
│   └── com.qwertayu.chrome-window-names.plist 同上
├── vscode/
│   ├── settings.json       → ~/Library/Application Support/Code/User/settings.json
│   ├── keybindings.json    → ~/Library/Application Support/Code/User/keybindings.json
│   └── snippets/           → ~/Library/Application Support/Code/User/snippets/
├── claude/
│   ├── settings.json       → ~/.claude/settings.json
│   ├── CLAUDE.md           → ~/.claude/CLAUDE.md
│   └── skills.txt          gh skill install で入れる他人の skill の一覧
├── herdr/
│   ├── readme.md           ワークスペースとタブの分け方
│   ├── config.toml         → ~/.config/herdr/config.toml
│   └── plugins/
│       ├── ascii-input-source/  英字で使うアプリのペインで入力ソースを英字にする
│       └── dev-layout/          タブを claude / fresh / lazygit / ターミナル に並べる
├── fresh/
│   ├── config.json         → ~/.config/fresh/config.json
│   ├── themes/
│   │   └── vscode-dark-modern.json → ~/.config/fresh/themes/vscode-dark-modern.json
│   └── plugins/
│       └── file_icons.ts   → ~/.config/fresh/plugins/file_icons.ts
├── lazygit/
│   └── config.yml          → ~/Library/Application Support/lazygit/config.yml
├── ghostty/
│   └── config.ghostty      → ~/.config/ghostty/config.ghostty
├── macos/
│   └── macos.sh            Finder・Dock・トラックパッドなどのmacOS設定
├── setup.sh                シンボリックリンクを貼るスクリプト
├── setup-agent-skills.sh   Claude Code の skill を ~/.claude/skills/ に入れる（setup.sh から呼ばれる）
└── README.md
```

ツールごとにフォルダを分け、リポジトリ内のファイル名はドットなしにしている
（将来 Nix / home-manager / nix-darwin に移行しやすくするため）。

## 新しいMacでのセットアップ

### 1. 開発ツールと Homebrew

```sh
xcode-select --install
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/opt/homebrew/bin/brew shellenv)"
softwareupdate --install-rosetta --agree-to-license
```

Rosetta は OrbStack で Intel（amd64）向けの Docker イメージを動かすのに使う。
入れておかなくても、必要になったときにダイアログで聞かれる。

### 2. clone してアプリを一括インストール

```sh
git clone https://github.com/あなたのユーザー名/dotfiles.git ~/dotfiles
cd ~/dotfiles
brew bundle --file=homebrew/Brewfile
```

bash・bash-completion・gh・VS Code・Chrome・Claude Code・VS Code拡張機能などがまとめて入る。
公式サイトから入れたアプリと重複してエラーになる場合は
`brew install --cask --adopt アプリ名` で Homebrew 管理に移す。

clone 先は `~/dotfiles` でなくてもよい。`setup.sh` は自分が置かれた場所を基準にリンクを貼る。
ただし `setup.sh` を実行した後にフォルダを移動・名前変更・削除すると、リンクが全部切れる。
移動したときは、新しい場所で `./setup.sh` を実行し直す。

### 3. シンボリックリンクを貼る

```sh
./setup.sh
```

既存のファイルがある場合は `.backup` を付けて退避される。
中身を確認して、必要な設定があれば dotfiles 側に移す。

非公開の `QwerTayu/dotfiles-private` を先に `~/dotfiles-private` に clone しておくと、
`setup.sh` が最後に `~/dotfiles-private/setup.sh` も実行して、そちらのリンクも張る（なければ何もしない）。

続けて、`mise/config.toml` に書いた node・java・marp-cli を入れる。

```sh
mise install
```

### 4. ログインシェルを Homebrew 版 bash にする

```sh
echo /opt/homebrew/bin/bash | sudo tee -a /etc/shells
chsh -s /opt/homebrew/bin/bash
```

ターミナルを開き直して `echo $BASH_VERSION` が 5.x ならOK。
`git ` と打って Tab を押し、サブコマンドが補完されれば bash-completion も有効。

### 5. git の個人情報を設定（このリポジトリには入れない）

名前とメールアドレスは `~/.gitconfig.local` に置き、`git/gitconfig` から `[include]` で読み込む。
`~/.gitconfig.local` は非公開の `QwerTayu/dotfiles-private`（`git/gitconfig.local`）で管理していて、
`~/dotfiles-private` を clone してあれば手順 3 の `setup.sh` がリンクを張る。

dotfiles-private を使わない Mac では、手で作る。

```sh
cat > ~/.gitconfig.local << 'EOF'
[user]
    name = 名前
    email = メールアドレス
EOF
```

### 6. GitHub にログイン

```sh
gh auth login
```

GitHub.com → HTTPS → Yes → Login with a web browser の順に選ぶ。

### 7. Claude Code にログイン

```sh
claude
```

ブラウザが開くので Claude アカウント（有料プラン）でログインする。
ユーザー全体で使う MCP サーバーがあれば `claude mcp add --scope user ...` で追加する。

### 8. macOS の設定

```sh
./macos/macos.sh
defaultbrowser chrome
```

デフォルトブラウザは macOS の仕様で確認ダイアログが出るので、ボタンを押して許可する。

Mac の名前は Mac ごとに違うので `macos.sh` には入れず、手で設定する（例: `QwerTayuMac`）。

```sh
sudo scutil --set ComputerName  名前   # AirDrop・Finder の共有などに表示される名前
sudo scutil --set LocalHostName 名前   # ネットワーク上の名前（名前.local）
sudo scutil --set HostName      名前   # ターミナルのプロンプトの \h
```

システム設定 → 一般 → 情報 → 名前 で変えると、HostName は未設定のまま残るので、HostName だけはコマンドで設定する。

### 9. 手動で許可・確認するもの

スクリプト化できない（macOS のセキュリティ上、手動操作が必要な）もの。

- **Raycast**：非公開のリポジトリ `QwerTayu/dotfiles-private` を `~/dotfiles-private` に clone し、
  Raycast を起動して「Import Settings & Data」で `~/dotfiles-private/raycast/raycast.rayconfig` を読み込む。
  パスワードは 1Password の「Raycast Export」に保存してある。
  ウィンドウ管理を使うので、システム設定 → プライバシーとセキュリティ → アクセシビリティ で Raycast を許可する。
- **Logi Options+**：初回起動時にアクセシビリティ・入力監視を許可する。
  マウスの「ポイント＆スクロール」でスクロールの向きを「標準」にする（macOS 側はナチュラルなスクロールがオンなので、マウスだけ逆にする）。
- **Chrome のウィンドウ名**：`setup.sh` のあと、launchd の `chrome-window-names` が Chrome を操作する許可を求めてくるので「許可」する。
  各ウィンドウに「【profile 名(タブ数)】タブ名」の名前が付き、Raycast の Switch Windows で profile を見分けられる（タブ名は 30 秒ごとに付け直す）。
  自分で「ウィンドウに名前を付ける」をした名前は残り、前に【profile 名(タブ数)】だけが付く。
  止めるときは `launchctl bootout gui/$(id -u)/com.qwertayu.chrome-window-names`。
- **入力ソース**：システム設定 → キーボード → 入力ソース で「ABC」と「日本語 - ローマ字入力」を追加する。
- **FileVault**：システム設定 → プライバシーとセキュリティ → FileVault がオンか確認する。

### 10. VS Code の Settings Sync を調整

Settings Sync を使う場合は、dotfiles と競合しないように同期項目を絞る。
`Cmd+Shift+P` →「Settings Sync: Configure」で以下のチェックを外す。

- Settings / Keyboard Shortcuts / User Snippets / User Tasks（dotfiles で管理）
- Extensions（Brewfile で管理）

## 日常の運用

### 設定ファイルを追加するとき

1. ツール名のフォルダを作り、ドットなしの名前でファイルを置く
2. `setup.sh` に `link フォルダ/ファイル .リンク先` の行を追加
3. `./setup.sh` を実行

### アプリや VS Code 拡張機能を追加・削除したとき

```sh
brew bundle dump --file=homebrew/Brewfile --force
```

### アプリを更新するとき

```sh
brew update && brew upgrade
```

Claude Code も Homebrew 版なのでこれで更新される（`claude update` ではなく brew で更新する）。
node・java・marp-cli は mise で入れているので、`mise upgrade` で更新する（`mise/config.toml` に書いた版の範囲で上がる）。
Chrome は自動アップデートされるので brew では更新されない。

更新があるかは、毎日 10:00 に launchd が `brew-check` を動かして確かめ、古くなったものがあれば macOS の通知で知らせる。
自動で `brew upgrade` はしないので、通知が来たら上のコマンドで更新する。
ログは `~/Library/Logs/brew-check.log`。すぐ確かめたいときは `brew-check` を直接実行するか、
`launchctl kickstart gui/$(id -u)/com.qwertayu.brew-check` で launchd から動かす。
Chrome や VS Code のように自分で更新するアプリも通知に出る。これはアプリを再起動すると新しい版になる。
launchd は起動したときのタイムゾーンで時刻を数える。新しい Mac でタイムゾーンを JST に変えたあとは再起動しないと、
初期設定の太平洋時間の 10:00（JST の 2:00 ごろ）に動いてしまう。ログの時刻がずれていたら再起動する。

Claude Code の skill は別に更新する。

```sh
gh skill update --all     # claude/skills.txt から入れた skill（--dry-run で確認だけ）
./setup-agent-skills.sh   # herdr の skill を今の herdr の版で書き出し直す
```

### macOS の設定を変えたいとき

`macos/macos.sh` に `defaults write` の行を追加して実行する。

GUI（システム設定）で変えた設定を取り込みたいときは、`~/dotfiles` で Claude Code を起動して
次のように頼むと、変更前後の `defaults read` の差分から `defaults write` に起こしてくれる。

```
これからシステム設定で〇〇を変更します。
変更前と変更後の defaults の差分を取って、macos/macos.sh に追記してください。
```

差分が見つからない設定は `defaults` で再現できないタイプなので、
このREADMEの「手動で許可・確認するもの」に手順として書いておく。

### Raycast の設定を変えたとき

Raycast の設定は、このリポジトリ（public）ではなく非公開の `QwerTayu/dotfiles-private`（`~/dotfiles-private`）に置く。
書き出す項目は選べず、クリップボード履歴なども全部入るため。

Raycast で「Export Settings & Data」を実行し、保存先に `~/dotfiles-private/raycast/` を選ぶ。
パスワードは 1Password の「Raycast Export」と同じものにする。
書き出されたファイル（`Raycast-...rayconfig`）を `raycast.rayconfig` に上書きで名前を変えて、コミットする。

```sh
cd ~/dotfiles-private
mv raycast/Raycast-*.rayconfig raycast/raycast.rayconfig
git add raycast/raycast.rayconfig && git commit -m "update raycast settings" && git push
```

中身は暗号化されているので git で差分は見られない。

### 変更を保存する

```sh
git add .
git commit -m "変更内容"
git push
```

## 管理の分担

| 対象 | 管理方法 |
|---|---|
| シェル・git・VS Code・Claude Code の設定 | dotfiles（シンボリックリンク） |
| アプリ・コマンド・VS Code 拡張機能 | Brewfile |
| node・java などの言語の版 | mise（`mise/config.toml`。プロジェクトごとの版はそのリポジトリの `mise.toml`） |
| Finder・Dock・トラックパッドなどの macOS 設定 | macos/macos.sh |
| アクセシビリティ許可・FileVault・デフォルトブラウザの確認 | 手動（このREADMEに手順を記載） |
| Raycast の設定・拡張機能 | dotfiles-private（非公開。暗号化した `.rayconfig` を Import） |
| Chrome のブックマーク・拡張機能 | Google アカウントの同期 |
| VS Code の UI 状態 | Settings Sync（または管理しない） |
| Claude Code のログイン情報・履歴（`~/.claude.json` など） | 管理しない |
| Claude Code の skill（`~/.claude/skills/`） | 中身は管理しない。`setup-agent-skills.sh` と `claude/skills.txt` で入れ直す |

## メモ

- Mac のターミナルはログインシェルで起動するので `.bash_profile` が読まれる。
  設定本体は `bashrc` に書き、`bash_profile` から読み込んでいる。
- `setlocale` の警告が出る場合は `bash_profile` の `LANG` / `LC_ALL` を確認。
- `~/.claude/` はフォルダごとリンクせず、自分で書くファイルだけを個別にリンクする
  （フォルダ内には会話履歴なども溜まるため）。
- `~/.claude.json` は Claude Code が自動で書き換える状態ファイルなので dotfiles に入れない。
- `~/.config/herdr/` もフォルダごとリンクせず `config.toml` だけをリンクする（同じフォルダにログが溜まるため）。
  herdr の plugin は設定ファイルで宣言できない。自作のもの（`herdr/plugins/`）は `setup.sh` が `herdr plugin link` で登録し、
  他人のもの（`herdr plugin install owner/repo`）は新しい環境で入れ直す。
- `~/.config/fresh/` も `config.json` だけをリンクする（`tsconfig.json` と `types/` は fresh が自動で作る）。
  welcome 画面の「Show this screen on startup」は `~/Library/Application Support/fresh/` の状態ファイルに保存されるので管理しない。新しい環境では手でチェックを外す。
- fresh のファイル一覧のアイコンは自作のプラグイン `fresh/plugins/file_icons.ts`（vscode-icons の代わり）。
  Nerd Font のアイコンを使うので、ターミナルのフォントが Nerd Font（HackGen Console NF）である必要がある。
  起動時にプロジェクトのファイルをたどってアイコンを付け、その後は保存・作成・名前変更されたファイルだけ付け直す。
  `node_modules`・`.git`・キャッシュ系のフォルダは中をたどらない（フォルダ自体には付ける）。対象は `SKIP_DIRS` で変える。
  fresh の外で増えたファイルは、コマンドパレットの `File Icons: Refresh` で付け直す。
  フォルダ名も標準の青（`syntax.keyword` の色）ではなく、ファイル名と同じ文字色にしている。
- Markdown は fresh のコマンドパレットの `Markdown: Toggle Compose/Preview` で読みやすく折り返せる（見た目のプレビューではない）。
  整形して見たいときは別のペインで `glow ファイル.md`。
  Marp のスライドは `marp-preview スライド.md`（フォルダでもよい）で、marp のサーバーを立てて右のペインに terminal-browser で開く。
  保存するとスライドも更新される。`Ctrl+C` でサーバーを止めると、herdr の中なら開いた terminal-browser のペインも閉じる
  （terminal-browser は Chromium なので、開いたままにするとページ 1 つで 100〜300MB ほどメモリを使い続ける）。
- `~/.local/bin` は `bash_profile` で PATH に入れていて、`setup.sh` が dotfiles のスクリプト（`brew-check`、`marp-preview`、`chrome-window-names`）をここにリンクする。
- herdr のワークスペースとタブの分け方（ワークスペース 1 つ = リポジトリ 1 つ）は `herdr/readme.md` にまとめている。
- 新しく herdr のワークスペースを作ると、プラグイン `dev-layout` が「左 1/4 に claude、右上に fresh と lazygit、
  右下 1/4 にターミナル」の並びにし、タブの名前を `main` にする。既存のタブは `prefix+shift+l` で、今いるペインを左に残して同じ並びにできる。
  ペインを移して作ったワークスペースなど、最初からペインが2つ以上あるときやシェル以外が動いているときは並べ替えない。
  起動するコマンドは `herdr/plugins/dev-layout/apply-layout.sh` の先頭で変えられる。
- lazygit などを使っている間は入力ソースを英字（ABC）にし、離れたら元の入力ソースに戻す。
  ペインの移動は herdr のプラグイン `ascii-input-source` が担当する（`pane.focused` のたびに、そのペインで
  `on-pane-focused.sh` の `ASCII_APPS` に書いたアプリが動いているかを見る）。英字にしたいアプリが増えたらそこに足す。
  元の入力ソースは `~/.local/state/ascii-input-source/saved` に覚えておく。
  切り替わるのはペインを移ったときだけで、今いるペインでアプリを起動・終了しても切り替わらない。
  コミットメッセージなどで日本語を打つときは自分で切り替える（lazygit には入力欄を開いたときに知らせる仕組みがない）。
  入力ソースの切り替えはプラグインの中の `input-source.js`（JXA で macOS の API を呼ぶ）で、追加のコマンドは入れていない。
- fresh・lazygit・herdr の色は VS Code の Dark Modern（`workbench.colorTheme`）に合わせている。
  色の値は VS Code 本体の `extensions/theme-defaults/themes/dark_modern.json` から取った。
  fresh は内蔵の `dark`（構文の色が VS Code の Dark+ と同じ）を `extends` して、背景や UI の色だけ上書きしている。
  lazygit の diff は delta（git-delta）で表示し、背景色・変わった文字の強調・構文の色・行番号を VS Code の inline の diff に合わせている。
  背景色は VS Code の半透明の色を Ghostty の背景 #181818 に重ねて計算した値なので、Ghostty の背景を変えたら計算し直す。
  lazygit と herdr のペインの背景色はターミナル（Ghostty）の色がそのまま使われるので、
  Ghostty の背景と ANSI の16色も VS Code の統合ターミナルの値にしている。
- ターミナルは Terminal.app ではなく Ghostty を使う。terminal-browser が kitty graphics protocol で画面を描くため
  （Terminal.app は対応していない）。herdr の `[experimental] kitty_graphics = true` もこのための設定。
  Terminal.app の中で herdr と terminal-browser を使うと、画像のデータが文字のまま出て herdr がとても重くなる。
- `~/.claude/skills/` の中身は dotfiles に入れない。`setup-agent-skills.sh` が出どころごとに入れる。
  - herdr の公式 skill: `herdr --skill` の出力を `~/.claude/skills/herdr/SKILL.md` に書き出す（リンクではなく普通のファイル）。
  - 他人の skill: `claude/skills.txt` の各行を `gh skill install ... --agent claude-code --scope user` で入れる。
    リポジトリは clone されず、その skill のフォルダだけがコピーされる。
    `--agent` と `--scope` を省くと別のエージェント向けに今のディレクトリへ入れようとするので、必ず付ける。
    `gh skill` には lockfile も削除コマンドもない。消すときは `claude/skills.txt` の行と `~/.claude/skills/<名前>` を手で消す。
    `gh skill` はまだ preview なので、使い方が変わることがある。
  - brew が入れる skill（terminal-browser など）: brew が自分でリンクを張るので何もしない。
  - 自作の skill: [QwerTayu/personal-agent-skills](https://github.com/QwerTayu/personal-agent-skills)（public）に置く。
    `setup-agent-skills.sh` は次の 2 つを行う。
    1. `~/Documents/personal/personal-agent-skills` がまだなければ clone する（新しい Mac 用）。
    2. リポジトリの `skills/` の中で `SKILL.md` があるフォルダごとに、`~/.claude/skills/` へリンクを張る
       （例: `~/.claude/skills/foo` → `~/Documents/personal/personal-agent-skills/skills/foo`）。
       `SKILL.md` がないフォルダは飛ばす。
    リンクなので、リポジトリで編集すればすぐ反映される（`gh skill` のコピーではなくリンクにしている理由）。
    skill を足したら `./setup-agent-skills.sh` を実行し直す。
- `claude/settings.json` の `SessionStart` フックは herdr の Claude 連携が書き込んだもので、
  `/Users/icoca/.claude/hooks/herdr-agent-state.sh` を絶対パスで呼んでいる。
  `$HOME` には書き換えない。herdr は文字列の完全一致で自分のフックを見分けるので、
  書き換えると `herdr integration install claude` のたびにフックが追加されて二重に実行される。
  ユーザー名が違う Mac では、このフックを消してから `herdr integration install claude` を実行し、
  herdr にその Mac のパスで書き直させる。
  なお `herdr integration status` はスクリプトの有無しか見ないので、フックの確認には使えない。
- 認証情報（SSH鍵、トークンなど）はコミットしない。
- Raycast の 1Password 拡張は入れない（Raycast と 1Password CLI を連携しない）。
  CLI 連携は一度許可すると、しばらく Raycast のプロセスから `op` で vault を読めるため、
  Raycast 本体や他の拡張機能に問題があったときに 1Password の中身が漏れるおそれがある。
  代わりに 1Password 標準のクイックアクセス（`Cmd + Shift + Space`）を使う。
- 最終目標はこの[dotfiles](https://github.com/YosukeIida/dotfiles)
