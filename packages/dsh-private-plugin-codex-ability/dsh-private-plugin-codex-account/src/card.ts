/**
 * The declarative card the hub renders on this account's behalf. No browser
 * code ships with the plugin: the descriptor, the state, and the invoke seam
 * are the whole surface.
 *
 * Two sign-in gestures, mirroring `codex login`: the ChatGPT-subscription
 * OAuth flow (opens the authorize page, catches the callback on a local
 * server, stores the tokens) and the Platform API key, pasted straight into
 * a hub modal — no console round-trip (creating a key still happens on
 * platform.openai.com, at the user's initiative).
 */

import type { AccountHubCardDescriptor } from '@dsh-private/api-account-hub'
import { REGIONS } from './regions.ts'

export const CARD: AccountHubCardDescriptor = {
  fields: [
    {
      key: 'region', kind: 'select', surface: 'account', when: 'signed-out',
      label: '可用国家与地区',
      // ~200 entries: the hub renders a filterable dropdown; the picked
      // region persists immediately, so reopening pre-selects it.
      searchable: true,
      autoSave: true,
      description: '登录前须选择，且须与当前网络出口地区和本机系统时区一致，否则登录将被拒绝。选中即自动保存，下次打开默认选中。',
      options: REGIONS,
    },
    {
      key: 'oauthSignIn', kind: 'button', surface: 'account', when: 'signed-out',
      action: 'sign-in', label: '登录 ChatGPT 账号', tone: 'primary', busyLabel: '等待授权回调…',
    },
    {
      key: 'pasteKey', kind: 'dialog', surface: 'account', when: 'signed-out',
      action: 'paste-key', label: '粘贴 API Key 登录', busyLabel: '正在登录…',
      dialog: {
        title: '登录 Platform API Key',
        submitLabel: '登录',
        fields: [
          { key: 'apiKey', kind: 'password', label: 'OpenAI Platform API Key', placeholder: 'sk-…' },
        ],
      },
    },
    {
      key: 'signOut', kind: 'button', surface: 'account', when: 'signed-in',
      action: 'sign-out', label: '退出登录', busyLabel: '退出中…',
    },
    {
      key: 'hint', kind: 'note', surface: 'models', placement: 'catalog',
      label: '点「获取可用模型」拉取官方目录与插件内置模型清单的合并结果（按模型去重）；勾选保存的即启用的模型，未勾选的不出现。',
    },
  ],
}
