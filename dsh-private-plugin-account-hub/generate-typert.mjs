// Standalone Typert generation for the extracted api-account-hub package.
//
// The harness root build runs the Typert generator over its own workspace; the
// extracted package no longer lives there, so this script binds the generator
// to the container root (its aggregate tsconfig.host.json references the
// component) and writes the artifacts into the component's lib/ exactly as
// the harness tsdown plugin would:
//   lib/typert.host.js/.d.ts            — host face reflection
//   lib/typert.remote-client.js/.d.ts   — the client-side remote contribution
//
// Run after the host tsc build has emitted lib/types:
//   node generate-typert.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HARNESS = fileURLToPath(new URL('../../../DeepSeekHarnessPrivate/deepseek-harness/', import.meta.url))
const { WorkspaceTypertGenerator } = await import(
  new URL(HARNESS + 'packages/typert/generator/lib/types/index.js', import.meta.url).href
)

const root = fileURLToPath(new URL('.', import.meta.url))
const generator = new WorkspaceTypertGenerator(root, { checkDiagnostics: false })
// Mirror the harness tsdown plugin's selection: discover, then keep only
// packages whose manifest publishes a Typert export subpath.
const exportsOf = (packageRoot) => {
  const manifest = JSON.parse(readFileSync(join(root, packageRoot, 'package.json'), 'utf8'))
  const exportsField = manifest.exports
  if (exportsField === null || typeof exportsField !== 'object') return false
  return ['./typert', './client/typert', './remote'].some(subpath => Object.hasOwn(exportsField, subpath))
}
const selected = generator.discover(['host'])
  .filter(candidate => exportsOf(candidate.root))
  .map(candidate => candidate.package)
const artifacts = generator.generate(selected, ['host'])
if (artifacts.length === 0) {
  console.error('generate-typert: no artifacts emitted — check packages/api-account-hub surface')
  process.exit(1)
}
for (const artifact of artifacts) {
  const output = join(root, artifact.packageRoot, 'lib')
  mkdirSync(output, { recursive: true })
  writeFileSync(join(output, `typert.${artifact.face}.js`), artifact.js)
  writeFileSync(join(output, `typert.${artifact.face}.d.ts`), artifact.dts)
  if (artifact.remote !== undefined) {
    writeFileSync(join(output, 'typert.remote-client.js'), artifact.remote.js)
    writeFileSync(join(output, 'typert.remote-client.d.ts'), artifact.remote.dts)
    writeFileSync(join(output, 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
    console.log('emitted', artifact.package, 'lib/typert.host.* + lib/typert.remote-client.*')
  } else {
    console.log('emitted', artifact.package, `lib/typert.${artifact.face}.* (no remote client)`)
  }
}
