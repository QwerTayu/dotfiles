#!/bin/bash
# Finder: 拡張子を常に表示（Windowsから来ると欲しくなるやつ）
defaults write NSGlobalDomain AppleShowAllExtensions -bool true
# Finder: 隠しファイルを表示
defaults write com.apple.finder AppleShowAllFiles -bool true
# Finder: パスバーを表示
defaults write com.apple.finder ShowPathbar -bool true
# Dock: 自動で隠す
defaults write com.apple.dock autohide -bool true

killall Finder Dock
