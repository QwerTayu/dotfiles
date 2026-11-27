#!/bin/bash
# Claude Code を、起動したフォルダに合わせたアカウントで起動する。~/.local/bin/claude にリンクして、brew の claude より先に見つかるようにする。
# 既定は TMLlab のアカウントで、設定フォルダを ~/.claude-tmllab にして起動する（CLAUDE_CONFIG_DIR）。ログイン情報はそこに別に持つ。
# フォルダの mise.local.toml に CLAUDE_ACCOUNT = "me" とあれば、個人のアカウント（ふだんの ~/.claude）で起動する。
# ~/.claude-tmllab の中の設定・skill・会話の履歴・memory などは ~/.claude へのリンクにして、どちらのアカウントでも共通にする（claude/readme.md）。
set -u
REAL=/opt/homebrew/bin/claude
LAB="$HOME/.claude-tmllab"
# ~/.claude-tmllab から ~/.claude へリンクするもの。ログイン情報・組織ごとの設定（policy-limits など）・動いている間の状態は入れない
SHARED=(CLAUDE.md settings.json statusline.sh rules skills plugins projects history.jsonl file-history)

# worktree（~/.herdr/worktrees/...）の中なら、元のリポジトリのフォルダの設定を読む
dir=$PWD
common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && [ "${common##*/}" = .git ] && dir=${common%/.git}

# `claude --me` / `claude --lab` のように、起動するときに付けたものがいちばん強い（研究室の利用上限に達したときなどに、1 回だけ切り替える）。
# この 2 つは claude.sh が取り除いてから、残りの引数を claude に渡す（`--` より後ろは見ない）
account=
args=()
rest=0
for a in "$@"; do
  if [ "$rest" = 0 ]; then
    case "$a" in
      --me) account=me; continue ;;
      --lab) account=lab; continue ;;
      --) rest=1 ;;
    esac
  fi
  args+=("$a")
done
# 付けていなければ、フォルダの mise.local.toml の値。mise は --shims で有効にしているので、[env] は mise exec を通して読む。親の claude から受け継いだ値は使わない
[ -n "$account" ] || account=$(env -u CLAUDE_ACCOUNT mise -C "$dir" exec -- sh -c 'printf %s "${CLAUDE_ACCOUNT-}"' 2>/dev/null)
unset CLAUDE_ACCOUNT

# 親の claude から受け継いだ設定フォルダやトークンは使わない
unset CLAUDE_CONFIG_DIR CLAUDE_CODE_OAUTH_TOKEN
case "$account" in
  me) ;;
  '' | lab)
    mkdir -p "$LAB"
    for name in "${SHARED[@]}"; do
      [ -e "$HOME/.claude/$name" ] || continue
      if [ -e "$LAB/$name" ] && [ ! -L "$LAB/$name" ]; then
        echo "claude: $LAB/$name がリンクではない（~/.claude と共通にならない）" >&2
        continue
      fi
      ln -sfn "$HOME/.claude/$name" "$LAB/$name"
    done
    # 自分で足した MCP（~/.claude.json の mcpServers）は、ログインの情報と同じファイルにあってリンクできないので、起動のたびに写す
    lab_json="$LAB/.claude.json"
    if [ -f "$HOME/.claude.json" ]; then
      [ -f "$lab_json" ] || echo '{}' > "$lab_json"
      if ! cmp -s <(jq -S '.mcpServers // {}' "$HOME/.claude.json") <(jq -S '.mcpServers // {}' "$lab_json"); then
        tmp=$(mktemp "$lab_json.XXXXXX") &&
          jq --slurpfile p "$HOME/.claude.json" '.mcpServers = ($p[0].mcpServers // {})' "$lab_json" > "$tmp" &&
          mv "$tmp" "$lab_json"
      fi
    fi
    export CLAUDE_CONFIG_DIR=$LAB
    ;;
  *)
    echo "claude: CLAUDE_ACCOUNT=$account は知らない値（lab か me）" >&2
    exit 1
    ;;
esac
exec "$REAL" ${args[@]+"${args[@]}"}
