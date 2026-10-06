#!/bin/sh
# Create the node_modules link farm this local-development plugin needs.
#
# The plugin loads directly from this directory, so bare `@deepseek-ai/*`
# imports must resolve here. Each link points at the in-repository workspace
# package; when the plugin moves to its own repository these become real
# dependencies.
#
set -eu

REPO="${1:-$HOME/Projects/DeepSeekHarnessPrivate/deepseek-harness}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HERE/node_modules/@deepseek-ai"

link() {
  target="$REPO/$1"
  link_path="$HERE/node_modules/$2"
  if [ -e "$link_path" ] || [ -L "$link_path" ]; then rm "$link_path"; fi
  ln -s "$target" "$link_path"
  echo "linked $2"
}

link vendor/cordis                    @deepseek-ai/cordis
link vendor/loader                    @deepseek-ai/cordis-plugin-loader
link vendor/cosmokit                  @deepseek-ai/cosmokit
link vendor/schemastery               @deepseek-ai/schemastery
link packages/llm/llm                 @deepseek-ai/dsh-llm
link packages/core/tools              @deepseek-ai/dsh-tools
link packages/core/system-prompt      @deepseek-ai/dsh-system-prompt
link packages/core/agent              @deepseek-ai/dsh-agent
link packages/preset/agent-preset-registry @deepseek-ai/dsh-agent-preset-registry
link packages/api/account-hub          @deepseek-ai/dsh-api-account-hub
link packages/credentials/credentials  @deepseek-ai/dsh-credentials
link packages/util/values              @deepseek-ai/dsh-util-values
link packages/util/native-command      @deepseek-ai/dsh-native-command

# The patched pi-ai instance the harness's llm-pi-ai package links: the
# account plugin builds its route provider over the same installation, so a
# patch can never diverge between the two consumers.
pi_ai_source="$(ls -d "$REPO"/node_modules/.pnpm/@earendil-works+pi-ai@*/node_modules/@earendil-works/pi-ai 2>/dev/null | head -1 || true)"
if [ -n "$pi_ai_source" ]; then
  mkdir -p "$HERE/node_modules/@earendil-works"
  ln -sfn "$pi_ai_source" "$HERE/node_modules/@earendil-works/pi-ai"
  echo "linked @earendil-works/pi-ai <- $pi_ai_source"
else
  echo "warning: no @earendil-works/pi-ai found in the repository tree" >&2
fi

# Every nested component package is addressable by its own package name; the
# preset tree mounts each one as `zcode-<capability>`. None of them import each
# other, so no package depends on another's link being present.
for comp in \
  dsh-private-plugin-zcode-persona \
  dsh-private-plugin-zcode-skills \
  dsh-private-plugin-zcode-plan \
  dsh-private-plugin-zcode-workflow \
  dsh-private-plugin-zcode-environment \
  dsh-private-plugin-z.ai-account; do
  target="$HERE/$comp"
  link_path="$HERE/node_modules/$comp"
  if [ -e "$link_path" ] || [ -L "$link_path" ]; then rm "$link_path"; fi
  ln -s "$target" "$link_path"
  echo "self-linked $comp"
done

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
