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
│   └── Brewfile            アプリ・コマンド・VS Code拡張機能の一覧
├── vscode/
│   ├── settings.json       → ~/Library/Application Support/Code/User/settings.json
│   ├── keybindings.json    → ~/Library/Application Support/Code/User/keybindings.json
│   └── snippets/           → ~/Library/Application Support/Code/User/snippets/
├── macos/
│   └── macos.sh            Finder・Dock などのmacOS設定
├── setup.sh                シンボリックリンクを貼るスクリプト
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
```

### 2. clone してアプリを一括インストール

```sh
git clone https://github.com/あなたのユーザー名/dotfiles.git ~/dotfiles
cd ~/dotfiles
brew bundle --file=homebrew/Brewfile
```

bash・gh・VS Code・Chrome・VS Code拡張機能などがまとめて入る。
公式サイトから入れたアプリと重複してエラーになる場合は
`brew install --cask --adopt アプリ名` で Homebrew 管理に移す。

### 3. シンボリックリンクを貼る

```sh
./setup.sh
```

既存のファイルがある場合は `.backup` を付けて退避される。
中身を確認して、必要な設定があれば dotfiles 側に移す。

### 4. ログインシェルを Homebrew 版 bash にする

```sh
echo /opt/homebrew/bin/bash | sudo tee -a /etc/shells
chsh -s /opt/homebrew/bin/bash
```

ターミナルを開き直して `echo $BASH_VERSION` が 5.x ならOK。

### 5. git の個人情報を設定（リポジトリには入れない）

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

### 7. macOS の設定

```sh
./macos/macos.sh
defaultbrowser chrome
```

デフォルトブラウザは macOS の仕様で確認ダイアログが出るので、ボタンを押して許可する。

### 8. VS Code の Settings Sync を調整

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

### macOS の設定を変えたいとき

`macos/macos.sh` に `defaults write` の行を追加して実行する。

### 変更を保存する

```sh
git add .
git commit -m "変更内容"
git push
```

## 管理の分担

| 対象 | 管理方法 |
|---|---|
| シェル・git・VS Code の設定 | dotfiles（シンボリックリンク） |
| アプリ・コマンド・VS Code 拡張機能 | Brewfile |
| Finder・Dock などの macOS 設定 | macos/macos.sh |
| Chrome のブックマーク・拡張機能 | Google アカウントの同期 |
| VS Code の UI 状態 | Settings Sync（または管理しない） |

## メモ

- Mac のターミナルはログインシェルで起動するので `.bash_profile` が読まれる。
  設定本体は `bashrc` に書き、`bash_profile` から読み込んでいる。
- `setlocale` の警告が出る場合は `bash_profile` の `LANG` / `LC_ALL` を確認。
- Chrome は自動アップデートされるので `brew upgrade` では更新されない。
- 認証情報（SSH鍵、トークンなど）はコミットしない。
