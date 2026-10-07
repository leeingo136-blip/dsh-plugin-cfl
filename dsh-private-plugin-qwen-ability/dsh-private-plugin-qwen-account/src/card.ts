/**
 * The declarative card the hub renders on this account's behalf. No browser
 * code ships with the plugin: the descriptor, the state, and the invoke seam
 * are the whole surface.
 *
 * The sign-in gesture opens the ModelStudio console's API-key page in the
 * user's browser; the paste step happens in this component's configuration
 * form, and storing the key is the whole login.
 */

import type { AccountHubCardDescriptor } from '@dsh-private/api-account-hub'

export const CARD: AccountHubCardDescriptor = {
  fields: [
    {
      key: 'getApiKey', kind: 'button', surface: 'account', when: 'signed-out',
      action: 'sign-in', label: '获取 API Key', tone: 'primary', busyLabel: '正在打开控制台…',
    },
    {
      key: 'signOut', kind: 'button', surface: 'account', when: 'signed-in',
      action: 'sign-out', label: '退出登录', busyLabel: '退出中…',
    },
    {
      key: 'note', kind: 'note', surface: 'account',
      label: '登录与千问 Code 现行 /auth 一致（OAuth 免费通道 2026-04-15 已停用）：选择端点套餐（Coding Plan / Token Plan / DashScope 兼容模式），点「获取 API Key」打开对应控制台创建密钥，粘贴到本组件配置中保存即完成登录；密钥同步存入凭据管理，退出登录一键清除。',
    },
    {
      key: 'hint', kind: 'note', surface: 'models', placement: 'catalog',
      label: '点击「获取可用模型」拉取该端点可见的模型，勾选加入目录并保存即可使用。',
    },
  ],
}
