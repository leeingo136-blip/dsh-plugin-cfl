/**
 * Builds the dh-ui client bundle in the exact `window.__ModuleLoader__.load`
 * wrapper the official clientBundle produced (verified byte-shape against the
 * stock ui-account-hub/lib/client.js): CJS factory, `react` and every
 * `@deepseek-ai/*` import left external for the ModuleLoader to resolve.
 *
 * Run: node build-client.mjs   (from this directory)
 */
import { build } from 'esbuild'
import { readFile, stat } from 'node:fs/promises'

const pkg = JSON.parse(await readFile('package.json', 'utf8'))

await build({
  entryPoints: ['src/client/index.tsx'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  legalComments: 'none',
  sourcemap: false,
  // All @deepseek-ai imports in the source are type-only and erased; the
  // runtime externals are just React (resolved by the ModuleLoader).
  external: ['react', 'react/jsx-runtime'],
  outfile: 'lib/client.js',
  banner: {
    js: [
      'window.__ModuleLoader__.load({',
      `\tid: ${JSON.stringify(pkg.name)},`,
      '\tfactory: (require) => {',
      '\t\tvar module = { exports: {} };',
      '\t\tvar exports = module.exports;',
      '\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
    ].join('\n'),
  },
  footer: {
    js: '\n\t\treturn module.exports;\n\t}\n});',
  },
})

const info = await stat('lib/client.js')
console.log(`lib/client.js written (${info.size} bytes)`)
