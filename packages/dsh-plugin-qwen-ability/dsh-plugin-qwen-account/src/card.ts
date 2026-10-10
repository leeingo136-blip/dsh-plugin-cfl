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

import type { AccountHubCardDescriptor } from '@dsh/api-account-hub'

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
      key: 'endpointSettings', kind: 'dialog', surface: 'account', when: 'signed-in',
      action: 'update-endpoint', label: '插件设置', busyLabel: '正在保存…',
      dialog: {
        title: '插件设置',
        submitLabel: '保存',
        fields: [
          {
            key: 'plan', kind: 'select', label: '套餐',
            options: [
              { value: 'coding-plan', label: 'Coding Plan' },
              { value: 'token-plan', label: 'Token Plan' },
              { value: 'dashscope', label: 'DashScope 兼容模式' },
            ],
          },
          {
            key: 'region', kind: 'select', label: '区域', dependsOn: 'plan',
            options: [
              { value: 'cn', label: '北京 coding.dashscope.aliyuncs.com/v1', when: 'coding-plan' },
              { value: 'intl', label: '新加坡 coding-intl.dashscope.aliyuncs.com/v1', when: 'coding-plan' },
              { value: 'cn', label: '北京 token-plan.cn-beijing.maas.aliyuncs.com', when: 'token-plan' },
              { value: 'intl', label: '新加坡 token-plan.ap-southeast-1.maas.aliyuncs.com', when: 'token-plan' },
              { value: 'cn', label: '国内 dashscope.aliyuncs.com/compatible-mode/v1', when: 'dashscope' },
              { value: 'intl', label: '国际 dashscope-intl.aliyuncs.com/compatible-mode/v1', when: 'dashscope' },
            ],
          },
        ],
      },
    },
    {
      key: 'hint', kind: 'note', surface: 'models', placement: 'catalog',
      label: '登录后点「获取可用模型」拉取该端点可见的模型，勾选加入目录并保存即可使用。',
    },
  ],
}
