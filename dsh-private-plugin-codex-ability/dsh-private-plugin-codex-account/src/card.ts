/**
 * The declarative card the hub renders on this account's behalf. No browser
 * code ships with the plugin: the descriptor, the state, and the invoke seam
 * are the whole surface.
 *
 * Two sign-in gestures, mirroring `codex login`: the ChatGPT-subscription
 * OAuth flow (opens the authorize page, catches the callback on a local
 * server, stores the tokens) and the Platform API key (opens the console,
 * the paste step happens in this component's configuration form).
 */

import type { AccountHubCardDescriptor } from '@dsh-private/api-account-hub'

export const CARD: AccountHubCardDescriptor = {
  fields: [
    {
      key: 'oauthSignIn', kind: 'button', surface: 'account', when: 'signed-out',
      action: 'sign-in', label: '登录 ChatGPT 账号', tone: 'primary', busyLabel: '等待授权回调…',
    },
    {
      key: 'getApiKey', kind: 'button', surface: 'account', when: 'signed-out',
      action: 'open-console', label: '获取 API Key', busyLabel: '正在打开控制台…',
    },
    {
      key: 'signOut', kind: 'button', surface: 'account', when: 'signed-in',
      action: 'sign-out', label: '退出登录', busyLabel: '退出中…',
    },
    {
      key: 'note', kind: 'note', surface: 'account',
      label: '登录与 Codex CLI 一致：「登录 ChatGPT 账号」走官方 OAuth 授权码+PKCE 流（本地回调，令牌自动刷新）；Platform API Key 则在控制台创建后粘贴到本组件配置中保存。认证方式在配置中选择，凭证同步存入凭据管理，退出登录一键清除。',
    },
    {
      key: 'hint', kind: 'note', surface: 'models', placement: 'catalog',
      label: 'API Key 模式点「获取可用模型」拉取该账号可见的模型；ChatGPT 订阅模式使用内置 Codex 模型表，勾选保存即可使用。',
    },
  ],
}
