/**
 * The declarative card the hub renders on this account's behalf. No browser
 * code ships with the plugin: the descriptor, the state, and the invoke seam
 * are the whole surface.
 *
 * The sign-in gesture opens the Qwen device-authorization page in the user's
 * browser; the account column's note carries the user_code while the poll is
 * in flight (the attempt view's text, not this static note, shows it).
 */

import type { AccountHubCardDescriptor } from '@dsh-private/api-account-hub'

export const CARD: AccountHubCardDescriptor = {
  fields: [
    {
      key: 'signInDevice', kind: 'button', surface: 'account', when: 'signed-out',
      action: 'sign-in', label: 'Qwen 设备码登录', tone: 'primary', busyLabel: '等待授权确认…',
    },
    {
      key: 'signOut', kind: 'button', surface: 'account', when: 'signed-in',
      action: 'sign-out', label: '退出登录', busyLabel: '退出中…',
    },
    {
      key: 'note', kind: 'note', surface: 'account',
      label: '登录走 Qwen 设备码流程：弹出浏览器打开授权页并自动轮询确认，无需粘贴任何密钥；令牌过期后插件自动刷新。',
    },
    {
      key: 'hint', kind: 'note', surface: 'models', placement: 'catalog',
      label: '点击「获取可用模型」拉取该账号可见的模型，勾选加入目录并保存即可使用。',
    },
  ],
}
