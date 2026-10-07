// Node-half bundle for the extracted host service. The Typert artifacts in
// lib/ are emitted by ../generate-typert.mjs (copied from the harness build
// that owns the generator workspace) and must not be cleaned here.
// Plain object on purpose: the component dir does not resolve 'tsdown'.
export default {
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
}
