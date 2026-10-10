/**
 * The declarative card the hub renders on this account's behalf. No browser
 * code ships with the plugin: the descriptor, the state, and the invoke seam
 * are the whole surface.
 *
 * Three sign-in gestures, mirroring `claude login` minus the paths this
 * plugin refuses to offer: the Claude-subscription OAuth flow (opens the
 * authorize page; the user copies the grant the hosted callback page shows
 * and pastes it back), and the Console API key, pasted straight into a hub
 * modal — no console round-trip (creating a key still happens on
 * console.anthropic.com, at the user's initiative). There is deliberately
 * no account/password gesture: the plugin never handles a user's Claude
 * credentials, only OAuth grants and API keys.
 */

import type { AccountHubCardDescriptor } from '@dsh/api-account-hub'
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
      action: 'sign-in', label: '登录 Claude 账号', tone: 'primary', busyLabel: '正在打开授权页…',
      description: '在浏览器完成登录授权后，复制页面显示的授权码，再点「粘贴授权码登录」提交。',
    },
    {
      key: 'pasteCode', kind: 'dialog', surface: 'account', when: 'signed-out',
      action: 'complete-sign-in', label: '粘贴授权码登录', busyLabel: '正在登录…',
      dialog: {
        title: '粘贴授权码',
        submitLabel: '登录',
        fields: [
          { key: 'code', kind: 'text', label: '授权码', placeholder: 'code#state 或完整回调 URL' },
        ],
      },
    },
    {
      key: 'pasteKey', kind: 'dialog', surface: 'account', when: 'signed-out',
      action: 'paste-key', label: '粘贴 API Key 登录', busyLabel: '正在登录…',
      dialog: {
        title: '登录 Console API Key',
        submitLabel: '登录',
        fields: [
          { key: 'apiKey', kind: 'password', label: 'Anthropic Console API Key', placeholder: 'sk-ant-api…' },
        ],
      },
    },
    {
      key: 'signOut', kind: 'button', surface: 'account', when: 'signed-in',
      action: 'sign-out', label: '退出登录', busyLabel: '退出中…',
    },
    {
      key: 'hint', kind: 'note', surface: 'models', placement: 'catalog',
      label: '订阅模式点「获取可用模型」拉取插件内置模型清单；API Key 模式拉取 Console 目录与内置清单的合并结果。勾选保存的即启用的模型，未勾选的不出现。',
    },
  ],
}
