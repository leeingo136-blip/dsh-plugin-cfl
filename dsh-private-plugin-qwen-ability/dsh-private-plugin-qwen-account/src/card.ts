/**
 * The declarative card the hub renders on this account's behalf. No browser
 * code ships with the plugin: the descriptor, the state, and the invoke seam
 * are the whole surface.
 *
 * The sign-in gesture is a hub modal: the key is pasted straight into the
 * dialog and the submit stores it — no console round-trip. Creating a key
 * still happens in the ModelStudio console, whose URL the signed-out state
 * surfaces as copy (some networks cannot reach the console, so nothing on
 * this card opens a browser automatically).
 */

import type { AccountHubCardDescriptor } from '@dsh-private/api-account-hub'

export const CARD: AccountHubCardDescriptor = {
  fields: [
    {
      key: 'signIn', kind: 'dialog', surface: 'account', when: 'signed-out',
      action: 'sign-in', label: '粘贴 API Key 登录', tone: 'primary', busyLabel: '正在登录…',
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
      key: 'note', kind: 'note', surface: 'account',
      label: '点「粘贴 API Key 登录」在弹窗中直接输入密钥，保存即完成登录（与千问 Code 现行 /auth 一致：OAuth 免费通道 2026-04-15 已停用）。密钥会同步存入凭据管理，退出登录一键清除。还没有密钥时，先在端点预设对应的百炼控制台创建。',
    },
    {
      key: 'hint', kind: 'note', surface: 'models', placement: 'catalog',
      label: '登录后点「获取可用模型」拉取该端点可见的模型，勾选加入目录并保存即可使用。',
    },
  ],
}
