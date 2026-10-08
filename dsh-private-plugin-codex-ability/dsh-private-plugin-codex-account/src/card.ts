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

export const CARD: AccountHubCardDescriptor = {
  fields: [
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
      key: 'note', kind: 'note', surface: 'account',
      label: '登录与 Codex CLI 一致：「登录 ChatGPT 账号」走官方 OAuth 授权码+PKCE 流（本地回调，令牌自动刷新）；「粘贴 API Key 登录」在弹窗中直接输入 Platform 密钥，保存即完成登录并自动切换认证方式（还没有密钥时先在 platform.openai.com 创建）。凭证同步存入凭据管理，退出登录一键清除。',
    },
    {
      key: 'hint', kind: 'note', surface: 'models', placement: 'catalog',
      label: 'API Key 模式点「获取可用模型」拉取该账号可见的模型；ChatGPT 订阅模式使用内置 Codex 模型表，勾选保存即可使用。',
    },
  ],
}
