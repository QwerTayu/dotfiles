#!/bin/bash
# gws（Google Workspace CLI）を mise exec を通して呼ぶ。~/.local/bin/gws にリンクして、brew の gws より先に見つかるようにする。
# mise は --shims で有効にしているので、brew で入れた gws には mise.local.toml の [env] が渡らない。
# mise exec を通すと、今いるディレクトリの GOOGLE_WORKSPACE_CLI_CONFIG_DIR が効き、ディレクトリごとに Google アカウントを分けられる。
exec mise exec -- /opt/homebrew/bin/gws "$@"
