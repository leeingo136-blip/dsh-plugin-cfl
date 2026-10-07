#!/bin/sh
# Create the node_modules link farms the three account-hub components need.
#
# Host components resolve @deepseek-ai/* through these links at build and
# runtime; the extracted sibling packages resolve to the container copies so
# the three components travel together.
set -eu

REPO="${1:-$HOME/Projects/DeepSeekHarnessPrivate/deepseek-harness}"
HERE="$(cd "$(dirname "$0")" && pwd)"

link() {
  # link <component-dir> <target-path-or-repo-relative> <package-name>
  target="$HERE/$1/node_modules/.absolute/$3"
  link_path="$HERE/$1/node_modules/$3"
  mkdir -p "$(dirname "$link_path")"
  if [ -e "$link_path" ] || [ -L "$link_path" ]; then rm "$link_path"; fi
  case "$2" in
    /*) ln -s "$2" "$link_path" ;;
    *)  ln -s "$REPO/$2" "$link_path" ;;
  esac
}

for c in packages/api-account-hub packages/ui-account-hub packages/ui-settings-models packages/typert-protocol packages/account-desktop-shim; do
  link "$c" "vendor/cordis" "@deepseek-ai/cordis"
  link "$c" "vendor/cosmokit" "@deepseek-ai/cosmokit"
  link "$c" "vendor/schemastery" "@deepseek-ai/schemastery"
  link "$c" "packages/util/values" "@deepseek-ai/dsh-util-values"
  link "$c" "packages/settings/settings" "@deepseek-ai/dsh-settings"
  link "$c" "packages/typert/protocol" "@deepseek-ai/dsh-typert-protocol"
done

# The desktop-shim imports the loader types only; keep the link for tsc.
link packages/account-desktop-shim "vendor/loader" "@deepseek-ai/cordis-plugin-loader"

# Extracted siblings resolve to the container copies in every component, and
# each component links itself so manifest-driven tooling can find it by name.
API_ABS="$(cd "$HERE/packages/api-account-hub" && pwd)"
MODELS_ABS="$(cd "$HERE/packages/ui-settings-models" && pwd)"
link packages/api-account-hub    "$API_ABS"    "@deepseek-ai/dsh-api-account-hub"
link packages/ui-account-hub     "$API_ABS"    "@deepseek-ai/dsh-api-account-hub"
link packages/ui-settings-models "$API_ABS"    "@deepseek-ai/dsh-api-account-hub"
link packages/api-account-hub    "$MODELS_ABS" "@deepseek-ai/dsh-client-ui-settings-models"
link packages/ui-account-hub     "$MODELS_ABS" "@deepseek-ai/dsh-client-ui-settings-models"
link packages/ui-settings-models "$MODELS_ABS" "@deepseek-ai/dsh-client-ui-settings-models"
link packages/api-account-hub    "."                     "@deepseek-ai/dsh-api-account-hub-self"
link packages/ui-account-hub     "."                     "@deepseek-ai/dsh-client-ui-account-hub-self"
link packages/ui-settings-models "."                     "@deepseek-ai/dsh-client-ui-settings-models-self"

for c in packages/ui-account-hub packages/ui-settings-models; do
  link "$c" "packages/api/remotes" "@deepseek-ai/dsh-api-remotes"
  link "$c" "packages/client/locale" "@deepseek-ai/dsh-client-locale"
  link "$c" "packages/client/product-analytics" "@deepseek-ai/dsh-client-product-analytics"
  link "$c" "packages/client/store" "@deepseek-ai/dsh-client-store"
  link "$c" "packages/client/ui-primitives" "@deepseek-ai/dsh-client-ui-primitives"
  link "$c" "packages/client/ui-renderer" "@deepseek-ai/dsh-client-ui-renderer"
  link "$c" "packages/client/ui-settings" "@deepseek-ai/dsh-client-ui-settings"
  link "$c" "packages/client/ui-slots" "@deepseek-ai/dsh-client-ui-slots"
  link "$c" "packages/client/ui-theme" "@deepseek-ai/dsh-client-ui-theme"
  link "$c" "packages/host/webserver" "@deepseek-ai/dsh-host-webserver"
  link "$c" "packages/client/modules" "@deepseek-ai/dsh-client-modules"
done

# npm-scope packages come from the harness install tree.
node_module() {
  # node_module <component-dir> <package-name>
  link_path="$HERE/$1/node_modules/$2"
  [ -e "$link_path" ] && return 0
  source="$(ls -d "$REPO/node_modules/.pnpm/$2@"*/node_modules/"$2" 2>/dev/null | head -1 || true)"
  if [ -z "$source" ]; then
    # Scoped packages store as @scope+name in the pnpm virtual store; pick the
    # shortest store entry (fewest peer suffixes) for stability.
    scope_dir="$(printf '%s' "$2" | sed 's|^@\([^/]*\)/|@\1+|')"
    source="$(ls -d "$REPO/node_modules/.pnpm/$scope_dir@"* 2>/dev/null | sort | head -1)/node_modules/$2"
  fi
  if [ -n "$source" ]; then
    mkdir -p "$(dirname "$link_path")"
    ln -s "$source" "$link_path"
    echo "linked $1 <- $2"
  else
    echo "warning: $2 not found in harness tree" >&2
  fi
}

for c in packages/api-account-hub packages/ui-account-hub packages/ui-settings-models packages/typert-protocol packages/account-desktop-shim; do
  node_module "$c" zod
  node_module "$c" "@types/node"
done
for c in packages/ui-account-hub packages/ui-settings-models; do
  node_module "$c" react
  node_module "$c" react-dom
  node_module "$c" "@types/react"
  node_module "$c" "@types/react-dom"
  node_module "$c" clsx
done

echo done
