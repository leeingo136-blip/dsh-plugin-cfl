#!/bin/sh
# Create the node_modules link farm this local-development plugin needs.
#
# The plugin loads through its package `main` (dist/index.js) via the dev-home
# profile dependency, so only the plugin's direct bare `@deepseek-ai/*`
# imports must resolve here — each link points at the in-repository workspace
# package, whose own node_modules resolves its transitive needs.
set -eu

REPO="${1:-$HOME/WorkBuddy/20260424114504/deepseek-harness}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HERE/node_modules/@deepseek-ai"

link() {
  target="$REPO/$1"
  link_path="$HERE/node_modules/$2"
  if [ -e "$link_path" ] || [ -L "$link_path" ]; then rm "$link_path"; fi
  ln -s "$target" "$link_path"
  echo "linked $2"
}

link vendor/cordis                 @deepseek-ai/cordis
link vendor/loader                 @deepseek-ai/cordis-plugin-loader
link vendor/cosmokit               @deepseek-ai/cosmokit
link vendor/schemastery            @deepseek-ai/schemastery
link packages/llm/llm              @deepseek-ai/dsh-llm
link packages/util/values          @deepseek-ai/dsh-util-values
link packages/credentials/credentials @deepseek-ai/dsh-credentials
link packages/api/account-hub      @deepseek-ai/dsh-api-account-hub

# zod comes from the workspace's installed dependency tree.
if [ ! -e "$HERE/node_modules/zod" ]; then
  zod_source="$(ls -d "$REPO"/packages/*/*/node_modules/zod 2>/dev/null | head -1 || true)"
  if [ -z "$zod_source" ]; then
    zod_source="$(ls -d "$REPO"/node_modules/.pnpm/zod@*/node_modules/zod 2>/dev/null | head -1 || true)"
  fi
  if [ -n "$zod_source" ]; then
    ln -s "$zod_source" "$HERE/node_modules/zod"
    echo "linked zod <- $zod_source"
  else
    echo "warning: no zod found in the repository tree" >&2
  fi
fi
echo done
