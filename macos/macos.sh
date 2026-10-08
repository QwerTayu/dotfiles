#!/bin/bash
# Finder: 拡張子を常に表示（Windowsから来ると欲しくなるやつ）
defaults write NSGlobalDomain AppleShowAllExtensions -bool true
# Finder: 隠しファイルを表示
defaults write com.apple.finder AppleShowAllFiles -bool true
# Finder: パスバーを表示
defaults write com.apple.finder ShowPathbar -bool true
# Finder: ステータスバー（項目数・空き容量）を表示
defaults write com.apple.finder ShowStatusBar -bool true
# Finder: ウィンドウのタイトルにフルパスを表示（使わないのでオフ）
# defaults write com.apple.finder _FXShowPosixPathInTitle -bool true
# Dock: 自動で隠す
defaults write com.apple.dock autohide -bool true
# トラックパッド: タップでクリック（内蔵・Bluetooth・ログイン画面）
defaults write com.apple.AppleMultitouchTrackpad Clicking -bool true
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking -bool true
defaults -currentHost write NSGlobalDomain com.apple.mouse.tapBehavior -int 1
# 電源: 電源アダプタ接続時はディスプレイを消さず、スリープもしない（バッテリー時は変えない）
# 画面が消えずスクリーンセーバーも起動しなければロックはかからない。クラムシェルモードも電源接続時に使える
sudo pmset -c displaysleep 0 sleep 0
# スクリーンセーバー: 起動しない
defaults -currentHost write com.apple.screensaver idleTime -int 0
# スクロールバー: 常に表示する（スクロールの向きを分かりやすくする）
defaults write NSGlobalDomain AppleShowScrollBars -string Always
# スクリーンショット: ファイルに保存せずクリップボードにコピーする
defaults write com.apple.screencapture target clipboard
# Spotlight: Cmd+Space のショートカットをオフにする（Raycast に使うため）
defaults write com.apple.symbolichotkeys AppleSymbolicHotKeys -dict-add 64 '<dict><key>enabled</key><false/></dict>'

# ショートカットの変更をログアウトせずに反映する
/System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/activateSettings -u
killall Finder Dock SystemUIServer
