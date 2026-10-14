#!/usr/bin/osascript -l JavaScript
// macOS の入力ソースを読む・切り替える（on-pane-focused.sh から使う）
//   ./input-source.js                          今の入力ソースの ID を出力する
//   ./input-source.js com.apple.keylayout.ABC  指定した入力ソースに切り替える
// ID の例: com.apple.keylayout.ABC（英字）、com.apple.inputmethod.Kotoeri.RomajiTyping.Japanese（日本語）
// 追加のコマンドを入れずに済むよう、macOS の Text Input Source Services を JXA から呼んでいる。
ObjC.import("Carbon");

function current() {
  const source = $.TISCopyCurrentKeyboardInputSource();
  return ObjC.castRefToObject($.TISGetInputSourceProperty(source, $.kTISPropertyInputSourceID)).js;
}

function select(id) {
  const filter = $.NSDictionary.dictionaryWithObjectForKey($(id), ObjC.castRefToObject($.kTISPropertyInputSourceID));
  const list = ObjC.castRefToObject($.TISCreateInputSourceList(filter, false));
  if (list.count === 0) throw new Error("入力ソースが見つかりません: " + id);
  if ($.TISSelectInputSource(list.objectAtIndex(0)) !== 0) throw new Error("切り替えに失敗しました: " + id);
}

function run(argv) {
  if (argv.length === 0) return current();
  select(argv[0]);
}
