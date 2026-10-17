#!/usr/bin/python3
# Chrome の各ウィンドウに「【profile 名(タブ数)】タブ名」の名前（Name window…）を付ける。
# Raycast の Switch Windows などで、どの profile のウィンドウかを見分けるため。
# launchd（launchd/com.qwertayu.chrome-window-names.plist）が 30 秒ごとに実行する。
#
# AppleScript からは profile がわからないので、AppleScript のウィンドウ ID が
# どの profile のセッションファイル（<profile>/Sessions/Session_*）に記録されているかで調べる。
# 自分で名前を付けたウィンドウは、その名前を残して【profile 名(タブ数)】だけを前に付ける。
import glob
import json
import os
import re
import struct
import subprocess

CHROME_DIR = os.path.expanduser("~/Library/Application Support/Google/Chrome")
STATE = os.path.expanduser("~/Library/Caches/chrome-window-names.json")
PREFIX = re.compile(r"^【[^】]*】")  # 自分で付けた名前から、前に付けた【…】を外す
MAX_TITLE = 60
US, RS = "\x1f", "\x1e"  # osascript の出力の区切り（項目・行）

LIST_WINDOWS = """
set out to ""
tell application "Google Chrome"
  repeat with w in (every window whose mode is "normal")
    set out to out & (id of w as text) & (character id 31) & (given name of w) & (character id 31) & (title of active tab of w) & (character id 31) & (count of tabs of w) & (character id 30)
  end repeat
end tell
return out
"""

SET_NAMES = """
on run argv
  tell application "Google Chrome"
    repeat with i from 1 to (count of argv) by 2
      repeat with w in every window
        if (id of w as text) is (item i of argv) then set given name of w to (item (i + 1) of argv)
      end repeat
    end repeat
  end tell
end run
"""


def osascript(script, *args):
    return subprocess.run(["osascript", "-", *args], input=script, capture_output=True,
                          text=True, check=True).stdout.rstrip("\n")


def load_state():
    try:
        with open(STATE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def profile_names():
    with open(os.path.join(CHROME_DIR, "Local State")) as f:
        cache = json.load(f)["profile"]["info_cache"]
    return {d: v.get("name") or d for d, v in cache.items()}


def find_profile(window_id, profiles):
    # ウィンドウ ID はセッションファイルに 4 バイトの整数として何度も出てくる。
    # たまたま同じバイト列がほかの profile にある場合に備えて、いちばん多く出てくる profile を選ぶ
    needle = struct.pack("<i", int(window_id))
    best, best_count = None, 0
    for d in profiles:
        count = 0
        for path in glob.glob(os.path.join(CHROME_DIR, d, "Sessions", "Session_*")):
            with open(path, "rb") as f:
                count += f.read().count(needle)
        if count > best_count:
            best, best_count = d, count
    return best


def main():
    if subprocess.run(["pgrep", "-xq", "Google Chrome"]).returncode != 0:
        return  # 起動していないときに tell application で Chrome を立ち上げない
    windows = [line.split(US) for line in osascript(LIST_WINDOWS).split(RS) if line]
    state = load_state()  # ウィンドウ ID → {profile, set: 最後に付けた名前, label: 自分で付けた名前}
    profiles = profile_names()
    updates = []
    for window_id, given, title, tabs in windows:
        s = state.get(window_id) or {}
        if not s.get("profile"):
            s["profile"] = find_profile(window_id, profiles)
            if not s["profile"]:
                continue  # 開いたばかりで、まだセッションファイルに書かれていない
        if given != s.get("set", ""):
            # 最後に付けた名前と違う → 自分で付け直した（空なら名前を外した）
            s["label"] = PREFIX.sub("", given)
        label = s.get("label") or title
        if len(label) > MAX_TITLE:
            label = label[:MAX_TITLE - 1] + "…"
        name = "【%s(%s)】%s" % (profiles.get(s["profile"], s["profile"]), tabs, label)
        if name != given:
            updates += [window_id, name]
        s["set"] = name
        state[window_id] = s
    if updates:
        osascript(SET_NAMES, *updates)
    # 閉じたウィンドウは忘れる
    open_ids = {w[0] for w in windows}
    state = {k: v for k, v in state.items() if k in open_ids}
    with open(STATE, "w") as f:
        json.dump(state, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
