// One-shot migration helper: rewrite tsconfig/tsdown relative paths for the
// account-hub container's new location (repo-as-workspace layout).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const HERE = new URL('.', import.meta.url).pathname
// Container packages/<component> -> harness root is 5 levels up.
const HARNESS = '../../../../../DeepSeekHarnessPrivate/deepseek-harness'

function rewrite(file, pairs) {
  const path = join(HERE, file)
  let text = readFileSync(path, 'utf8')
  for (const [from, to] of pairs) {
    text = text.split(from).join(to)
  }
  writeFileSync(path, text)
  console.log('rewrote', file)
}

// External siblings first (exact matches), then generic harness mappings.
const siblingFirst = [
  ['"../../api/account-hub"', '"../api-account-hub"'],
  ['"../ui-settings-models/', '"../ui-settings-models/'],
  ['"../ui-settings-models"', '"../ui-settings-models"'],
  ['../../../tsconfig.base.client.json', `${HARNESS}/tsconfig.base.client.json`],
  ['../../../tsconfig.base.json', `${HARNESS}/tsconfig.base.json`],
  ['../../../vendor/', `${HARNESS}/vendor/`],
  ['../../api/remotes/', `${HARNESS}/packages/api/remotes/`],
  ['../../util/values', `${HARNESS}/packages/util/values`],
  ['../../settings/settings', `${HARNESS}/packages/settings/settings`],
  ['../../typert/protocol', `${HARNESS}/packages/typert/protocol`],
  ['../locale/', `${HARNESS}/packages/client/locale/`],
  ['../ui-settings/', `${HARNESS}/packages/client/ui-settings/`],
  ['../ui-renderer', `${HARNESS}/packages/client/ui-renderer`],
  ['../ui-slots', `${HARNESS}/packages/client/ui-slots`],
  ['../ui-theme/', `${HARNESS}/packages/client/ui-theme/`],
  ['../ui-primitives', `${HARNESS}/packages/client/ui-primitives`],
]

for (const component of ['api-account-hub', 'ui-account-hub', 'ui-settings-models']) {
  rewrite(`packages/${component}/tsconfig.json`, siblingFirst)
}

// tsdown configs: point the shared preset at the harness copy.
for (const component of ['ui-account-hub', 'ui-settings-models']) {
  rewrite(`packages/${component}/tsdown.config.ts`, [
    ["'../tsdown.client.ts'", `'${HARNESS}/packages/client/tsdown.client.ts'`],
  ])
}
console.log('done')
