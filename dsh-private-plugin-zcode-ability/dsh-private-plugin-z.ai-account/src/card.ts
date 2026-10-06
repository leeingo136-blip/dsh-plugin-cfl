/**
 * The declarative card the hub renders on this account's behalf. No browser
 * code ships with the plugin: the descriptor, the state, and the invoke seam
 * are the whole surface.
 *
 * Fields split by surface the way the official account plugin does — the
 * account column carries the sign-in/sign-out gestures; the models-page
 * provider card carries only the catalog hint, inside the catalog block (the
 * account mounts its own pi-ai adapter route and wires the endpoint itself
 * per sign-in platform, so no URL field is exposed).
 */

import type { AccountHubCardDescriptor } from '@deepseek-ai/dsh-api-account-hub'

export const CARD: AccountHubCardDescriptor = {
  fields: [
    {
      key: 'signInOAuth', kind: 'button', surface: 'account', when: 'signed-out',
      action: 'sign-in', label: 'Z.ai 一键登录', tone: 'primary', busyLabel: '等待浏览器授权…',
    },
    {
      key: 'signInOAuthBigmodel', kind: 'button', surface: 'account', when: 'signed-out',
      action: 'sign-in-bigmodel', label: 'BigModel 一键登录', busyLabel: '等待浏览器授权…',
    },
    {
      key: 'signOut', kind: 'button', surface: 'account', when: 'signed-in',
      action: 'sign-out', label: '退出登录', busyLabel: '退出中…',
    },
    {
      key: 'note', kind: 'note', surface: 'account',
      label: '登录后本插件自动铸造并注入 API Key，模型页的「Z.ai 账号」行即可直接使用；在该行点「获取可用模型」勾选目录。',
    },
    {
      key: 'hint', kind: 'note', surface: 'models', placement: 'catalog',
      label: '点击「获取可用模型」拉取该凭据可见的模型，勾选加入目录并保存即可使用。',
    },
  ],
}
