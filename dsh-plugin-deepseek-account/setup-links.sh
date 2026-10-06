#!/bin/sh
# Create the node_modules link farm this local-development plugin needs.
#
# The plugin loads directly from this directory (the profile user patch names
# src/index.ts with an absolute path), so bare `@deepseek-ai/*` imports must
# resolve here. Each link points at the in-repository workspace package; when
# the plugin moves to its own repository these become real dependencies.
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
link vendor/cordis-plugin-loader   @deepseek-ai/cordis-plugin-loader
link vendor/cosmokit               @deepseek-ai/cosmokit
link vendor/schemastery            @deepseek-ai/schemastery
link packages/llm/llm-deepseek     @deepseek-ai/dsh-llm-deepseek
link packages/llm/llm              @deepseek-ai/dsh-llm
link packages/util/launch-environment @deepseek-ai/dsh-launch-environment
link packages/util/timeout         @deepseek-ai/dsh-timeout
link packages/util/native-command  @deepseek-ai/dsh-native-command
link packages/util/values          @deepseek-ai/dsh-util-values
link packages/credentials/credentials @deepseek-ai/dsh-credentials
link packages/credentials/authorization @deepseek-ai/dsh-authorization
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
