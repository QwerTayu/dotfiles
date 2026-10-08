#!/bin/bash
# Finder: 拡張子を常に表示（Windowsから来ると欲しくなるやつ）
defaults write NSGlobalDomain AppleShowAllExtensions -bool true
# Finder: 隠しファイルを表示
defaults write com.apple.finder AppleShowAllFiles -bool true
# Finder: パスバーを表示
defaults write com.apple.finder ShowPathbar -bool true
# Dock: 自動で隠す
defaults write com.apple.dock autohide -bool true
# トラックパッド: タップでクリック（内蔵・Bluetooth・ログイン画面）
defaults write com.apple.AppleMultitouchTrackpad Clicking -bool true
defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking -bool true
defaults -currentHost write NSGlobalDomain com.apple.mouse.tapBehavior -int 1
# スクロールバー: 常に表示する（スクロールの向きを分かりやすくする）
defaults write NSGlobalDomain AppleShowScrollBars -string Always
# スクリーンショット: ファイルに保存せずクリップボードにコピーする
defaults write com.apple.screencapture target clipboard
# Spotlight: Cmd+Space のショートカットをオフにする（Raycast に使うため）
defaults write com.apple.symbolichotkeys AppleSymbolicHotKeys -dict-add 64 '<dict><key>enabled</key><false/></dict>'

# ショートカットの変更をログアウトせずに反映する
/System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/activateSettings -u
killall Finder Dock SystemUIServer
