/** Copy dictionaries for the settings account column. */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  nav: 'Accounts',
  empty: 'Install an account plugin to use accounts.',
  loadFailed: 'Loading the account registry failed',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  saveFailed: 'Saving failed',
  actionFailed: 'Action failed',
  optionsFailed: 'Loading options failed',
  busy: 'Working…',
  selectPlaceholder: 'Select…',
  selectSearchPlaceholder: 'Search…',
  selectNoMatch: 'No matches',
  signedIn: 'Signed in',
  accountInfo: 'Account info',
  loading: 'Loading…',
  cancel: 'Cancel',
  groupChat: 'Chat models',
  groupEmbedding: 'Embedding models',
  groupTts: 'Text-to-speech',
  groupAsr: 'Speech recognition',
} as const

export type AccountHubKey = keyof typeof en

/** Chinese strings (same keys as {@link en}). */
export const zh: { [Key in AccountHubKey]: string } = {
  nav: '账号',
  empty: '安装插件以便使用账号',
  loadFailed: '账号注册表加载失败',
  save: '保存',
  saving: '保存中…',
  saved: '已保存',
  saveFailed: '保存失败',
  actionFailed: '操作失败',
  optionsFailed: '选项加载失败',
  busy: '处理中…',
  selectPlaceholder: '请选择…',
  selectSearchPlaceholder: '搜索…',
  selectNoMatch: '无匹配项',
  signedIn: '已登录',
  accountInfo: '账号信息',
  loading: '加载中…',
  cancel: '取消',
  groupChat: '对话模型',
  groupEmbedding: '向量模型',
  groupTts: '语音合成',
  groupAsr: '语音识别',
}
