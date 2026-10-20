#!/bin/bash
# Claude Code のステータスライン（入力欄の下の 1 行）。
# 「モデル · effort · 組織 · 5 時間と 1 週間の利用上限の使用率」を出す。
# Claude Code がセッションの情報を JSON で stdin に渡してくる。組織名はその JSON にないので ~/.claude.json から読む。
# 利用上限（rate_limits）は Pro / Max で、セッションの最初の応答のあとにだけ渡ってくる。
input="$(cat)"

get() { jq -r "$1 // empty" <<<"$input"; }

# 使用率に色を付ける: 50% 未満は緑、80% 未満は黄、それ以上は赤
paint() {
  local pct="$1" text="$2" color
  if [ "$pct" -lt 50 ]; then color=32; elif [ "$pct" -lt 80 ]; then color=33; else color=31; fi
  printf '\033[%sm%s\033[0m' "$color" "$text"
}

model="$(get .model.display_name)"
effort="$(get .effort.level)"
org="$(jq -r '.oauthAccount.organizationName // empty' "$HOME/.claude.json" 2>/dev/null)"
five="$(get '(.rate_limits.five_hour.used_percentage // empty) | floor')"
week="$(get '(.rate_limits.seven_day.used_percentage // empty) | floor')"

parts=()
[ -n "$model" ] && parts+=("$model")
[ -n "$effort" ] && parts+=("$effort")
[ -n "$org" ] && parts+=("$org")
[ -n "$five" ] && parts+=("$(paint "$five" "5h $five%")")
[ -n "$week" ] && parts+=("$(paint "$week" "7d $week%")")

out=""
for p in "${parts[@]}"; do
  out="${out:+$out · }$p"
done
printf '%s\n' "$out"
