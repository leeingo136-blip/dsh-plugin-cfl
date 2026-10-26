/** UI copy for the memory-echo section (zh first — the product language). */
export interface MemoryKey {
  navMemoryRecall: string
  loadFailed: string
  empty: string
  emptyHint: string
  createCard: string
  editCard: string
  newCardTitle: string

  fieldPlan: string
  planHint: string
  fieldPersona: string
  fieldSeed: string
  seedHint: string
  fieldName: string
  fieldNameHint: string
  fieldDescription: string
  fieldKind: string
  kindLocal: string
  kindService: string
  fieldAddress: string
  addressPlaceholderLocal: string
  addressPlaceholderService: string
  addressHintLocal: string
  fieldEmbedding: string
  embeddingPick: string
  embeddingUnavailable: string

  connectDb: string
  queryPlaceholder: string
  search: string
  searching: string
  noResults: string

  generatePreset: string
  save: string
  cancel: string
  delete: string
  deleteConfirm: string
  invalidInput: string
  nameDuplicate: string
  notFound: string
}

export const zh: MemoryKey = {
  navMemoryRecall: '心灵回响',
  loadFailed: '加载失败',
  empty: '还没有记忆库卡片',
  emptyHint: '新建一张卡片，连接一个 RAG 数据库。',
  createCard: '新增卡片',
  editCard: '编辑卡片',
  newCardTitle: '新增卡片',

  fieldPlan: '方案名称',
  planHint: '小写字母、数字与连字符，预设用它引用这个角色',
  fieldPersona: '角色介绍（系统提示词）',
  fieldSeed: '前置会话（JSONL）',
  seedHint: '每行一个 {"role":"user|assistant","text":"…"}；保存后按行解析',
  fieldName: '姓名',
  fieldNameHint: '唯一标识，作为工具参数使用',
  fieldDescription: '描述',
  fieldKind: '数据库类型',
  kindLocal: '本地文件',
  kindService: '网络服务',
  fieldAddress: '数据库地址',
  addressPlaceholderLocal: '/path/to/database.sqlite',
  addressPlaceholderService: 'https://example.com/rag',
  addressHintLocal: '留空时默认保存在插件数据目录内，随名称自动生成',
  fieldEmbedding: 'Embedding 引擎',
  embeddingPick: '请选择…',
  embeddingUnavailable: '暂无可用模型：请先在账号列启用本地向量模型',

  connectDb: '连接数据库',
  queryPlaceholder: '输入要检索的内容…',
  search: '搜索',
  searching: '检索中…',
  noResults: '没有命中结果',

  generatePreset: '生成预设',
  save: '保存',
  cancel: '取消',
  delete: '删除',
  deleteConfirm: '确定删除该卡片？',
  invalidInput: '输入不完整或有误',
  nameDuplicate: '名称已存在',
  notFound: '卡片不存在',
}

export const en: MemoryKey = {
  navMemoryRecall: 'Mind Echo',
  loadFailed: 'Load failed',
  empty: 'No memory cards yet',
  emptyHint: 'Create a card to connect a RAG database.',
  createCard: 'New card',
  editCard: 'Edit card',
  newCardTitle: 'New card',

  fieldPlan: 'Plan',
  planHint: 'Lowercase letters, digits and hyphens; presets reference this character by it',
  fieldPersona: 'Persona (system prompt)',
  fieldSeed: 'Seed conversation (JSONL)',
  seedHint: 'One {"role":"user|assistant","text":"…"} per line',
  fieldName: 'Name',
  fieldNameHint: 'Unique handle, passed to tools as a parameter',
  fieldDescription: 'Description',
  fieldKind: 'Database kind',
  kindLocal: 'Local file',
  kindService: 'Network service',
  fieldAddress: 'Address',
  addressPlaceholderLocal: '/path/to/database.sqlite',
  addressPlaceholderService: 'https://example.com/rag',
  addressHintLocal: 'Defaults to a file inside the plugin data directory, derived from the name',
  fieldEmbedding: 'Embedding engine',
  embeddingPick: 'Choose…',
  embeddingUnavailable: 'No models available: enable the local embedding model first',

  connectDb: 'Connect database',
  queryPlaceholder: 'Type what to search for…',
  search: 'Search',
  searching: 'Searching…',
  noResults: 'No matches',

  generatePreset: 'Generate preset',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  deleteConfirm: 'Delete this card?',
  invalidInput: 'Input is incomplete or invalid',
  nameDuplicate: 'Name already exists',
  notFound: 'Card not found',
}
