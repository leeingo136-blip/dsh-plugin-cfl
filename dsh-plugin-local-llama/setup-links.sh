#!/bin/sh
# Create the node_modules link farm this plugin needs on top of its vendored
# dependencies.
#
# Two kinds of things live in `node_modules/` here:
#   - vendored runtime dependencies (`npm install`, i.e. @huggingface/transformers
#     and its ONNX runtime), which is why installing this package needs no
#     network and no host-side dependency step;
#   - links to the repository's own workspace packages, so the plugin compiles
#     against exactly the harness sources it will run against. These are links,
#     not copies, because the plugin must never carry a second opinion about
#     harness types.
#
# The plugin loads through its package `main` (dist/index.js) via the dev-home
# profile dependency, so only its direct bare `@deepseek-ai/*` imports must
# resolve here — each link points at the in-repository workspace package, whose
# own node_modules resolves its transitive needs.
set -eu

REPO="${1:-$HOME/Projects/DeepSeekHarnessPrivate/deepseek-harness}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HERE/node_modules/@deepseek-ai"

link() {
  target="$REPO/$1"
  link_path="$HERE/node_modules/$2"
  if [ ! -d "$target" ]; then
    echo "error: missing source $target" >&2
    exit 1
  fi
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
link packages/api/account-hub      @deepseek-ai/dsh-api-account-hub

# Weights are fetched separately — they are far too large to live in a package
# and are downloaded by scripts/fetch-model.mjs on demand.
if [ ! -f "$HERE/models/onnx-community/Qwen3-0.6B-ONNX/onnx/model_int8.onnx" ]; then
  echo "note: weights not installed yet; run: node scripts/fetch-model.mjs" >&2
fi
echo done
