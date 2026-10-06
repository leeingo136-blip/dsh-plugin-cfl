#!/bin/sh
# Wire this plugin into the desktop dev home.
#
# This touches only the runtime dev home (apps/desktop/.desktop-build/…, which
# is git-ignored build output) — no harness source is modified. Three things
# have to agree for a plugin to load:
#   1. the profile declares it as a `link:` dependency,
#   2. the profile's bundle list activates it,
#   3. the package name resolves from the profile's node_modules.
# Missing any one of them yields a plugin that is silently absent.
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="${1:-$HOME/WorkBuddy/20260424114504/deepseek-harness}"
PROFILE="$REPO/apps/desktop/.desktop-build/development/home/profiles/desktop"
NODE="${NODE:-$(command -v node || echo /Users/infinite/.workbuddy/binaries/node/versions/22.22.2-6/bin/node)}"

if [ ! -f "$PROFILE/package.json" ]; then
  echo "error: profile not found at $PROFILE — start the desktop build once first" >&2
  exit 1
fi

"$NODE" - "$PROFILE/package.json" "$HERE" <<'NODE_SCRIPT'
const { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, symlinkSync } = require('node:fs')
const { join } = require('node:path')
const [file, pluginDir] = process.argv.slice(2)
const pkg = JSON.parse(readFileSync(file, 'utf8'))
const NAME = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8')).name
pkg.dependencies ??= {}
pkg.dependencies[NAME] = `link:${pluginDir}`
const profile = (pkg.dsh ??= {}).profile ??= {}
const bundles = profile.bundles ??= []
if (!bundles.includes(NAME)) bundles.push(NAME)
writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
const linkDir = join(file, '..', 'node_modules')
mkdirSync(linkDir, { recursive: true })
const linkPath = join(linkDir, NAME)
if (existsSync(linkPath) || require('node:fs').lstatSync(linkPath, { throwIfNoEntry: false })) rmSync(linkPath, { force: true })
symlinkSync(pluginDir, linkPath, 'dir')
console.log(`installed ${NAME} -> ${pluginDir}`)
NODE_SCRIPT

echo 'done — restart the desktop app to load it'
