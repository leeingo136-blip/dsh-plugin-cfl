/**
 * The declarative card the hub renders on this account's behalf. No browser
 * code ships with the plugin: the descriptor, the state, and the invoke seam
 * are the whole surface.
 *
 * The sign-in gesture is a hub modal: the key is pasted straight into the
 * dialog and the submit stores it — no console round-trip. The signed-out
 * card is the hub's single-line brand row (logo + name + action), so the
 * descriptor carries no notes on the account surface; creating a key still
 * happens in the ModelStudio console, at the user's initiative.
 */

import type { AccountHubCardDescriptor } from '@dsh-private/api-account-hub'

export const CARD: AccountHubCardDescriptor = {
  fields: [
    {
      key: 'signIn', kind: 'dialog', surface: 'account', when: 'signed-out',
      action: 'sign-in', label: 'API Key 登录', tone: 'primary', busyLabel: '正在登录…',
      dialog: {
        title: '登录 Qwen 账号',
        submitLabel: '登录',
        fields: [
          { key: 'apiKey', kind: 'password', label: '百炼 API Key', placeholder: 'sk-…' },
        ],
      },
    },
    {
      key: 'signOut', kind: 'button', surface: 'account', when: 'signed-in',
      action: 'sign-out', label: '退出登录', busyLabel: '退出中…',
    },
    {
      key: 'hint', kind: 'note', surface: 'models', placement: 'catalog',
      label: '登录后点「获取可用模型」拉取该端点可见的模型，勾选加入目录并保存即可使用。',
    },
  ],
}
