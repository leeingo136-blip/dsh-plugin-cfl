#!/bin/sh
# Unwire this plugin from the desktop dev home — the exact inverse of
# install-plugin.sh.
#
# Three things are undone, all inside the git-ignored runtime dev home:
#   1. the profile's `dependencies` link entry,
#   2. the profile's bundle-list entry,
#   3. the node_modules symlink.
# The plugin directory itself is only removed with --purge: it holds ~1.1 GB
# of weights and vendored dependencies that are slow to replace and safe to
# keep, so a plain uninstall leaves it on disk and merely stops loading it.
# Harness source is never touched by either script.
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="${1:-$HOME/WorkBuddy/20260424114504/deepseek-harness}"
PROFILE="$REPO/apps/desktop/.desktop-build/development/home/profiles/desktop"
NODE="${NODE:-$(command -v node || echo /Users/infinite/.workbuddy/binaries/node/versions/22.22.2-6/bin/node)}"

PURGE=0
for arg in "$@"; do
  [ "$arg" = "--purge" ] && PURGE=1
done

if [ ! -f "$PROFILE/package.json" ]; then
  echo "error: profile not found at $PROFILE — nothing to uninstall" >&2
  exit 1
fi

"$NODE" - "$PROFILE/package.json" "$HERE" "$PURGE" <<'NODE_SCRIPT'
const { readFileSync, writeFileSync, existsSync, rmSync, lstatSync } = require('node:fs')
const { join } = require('node:path')
const [file, pluginDir, purge] = process.argv.slice(2)
const NAME = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8')).name
const pkg = JSON.parse(readFileSync(file, 'utf8'))

let changed = false
if (pkg.dependencies && Object.hasOwn(pkg.dependencies, NAME)) {
  delete pkg.dependencies[NAME]
  changed = true
  console.log(`- dependencies.${NAME}`)
}
const bundles = pkg.dsh?.profile?.bundles
if (Array.isArray(bundles)) {
  const at = bundles.indexOf(NAME)
  if (at >= 0) {
    bundles.splice(at, 1)
    changed = true
    console.log(`- dsh.profile.bundles[${at}]`)
  }
}
if (changed) writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)

const linkPath = join(file, '..', 'node_modules', NAME)
if (lstatSync(linkPath, { throwIfNoEntry: false }) !== undefined) {
  // Only ever remove a symlink: a real directory here would mean the plugin
  // was copied rather than linked, which is not something this script made.
  if (lstatSync(linkPath).isSymbolicLink()) {
    rmSync(linkPath, { force: true })
    console.log(`- node_modules/${NAME} (symlink)`)
  } else {
    console.log(`! node_modules/${NAME} is a real directory — left alone`)
  }
}

if (purge === '1') {
  rmSync(pluginDir, { recursive: true, force: true })
  console.log(`- purged ${pluginDir}`)
}
console.log(`uninstalled ${NAME}`)
NODE_SCRIPT

if [ "$PURGE" = 0 ]; then
  echo "plugin directory kept: $HERE (add --purge to delete ~1.1 GB of weights)"
fi
echo 'done — restart the desktop app; then switch any session that used this model'
