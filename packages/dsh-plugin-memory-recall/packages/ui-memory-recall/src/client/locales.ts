/** UI copy for the memory-recall section (zh first — the product language). */
export interface MemoryKey {
  navMemoryRecall: string
  loadFailed: string
  empty: string
  emptyHint: string
  createCard: string
  editCard: string
  newCardTitle: string

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

  save: string
  cancel: string
  delete: string
  deleteConfirm: string
  invalidInput: string
  nameDuplicate: string
  notFound: string
}

export const zh: MemoryKey = {
  navMemoryRecall: '记忆回想',
  loadFailed: '加载失败',
  empty: '还没有记忆库卡片',
  emptyHint: '新建一张卡片，连接一个 RAG 数据库。',
  createCard: '新建卡片',
  editCard: '编辑卡片',
  newCardTitle: '新建卡片',

  fieldName: '名称',
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

  save: '保存',
  cancel: '取消',
  delete: '删除',
  deleteConfirm: '确定删除该卡片？',
  invalidInput: '输入不完整或有误',
  nameDuplicate: '名称已存在',
  notFound: '卡片不存在',
}

export const en: MemoryKey = {
  navMemoryRecall: 'Memory Recall',
  loadFailed: 'Load failed',
  empty: 'No memory cards yet',
  emptyHint: 'Create a card to connect a RAG database.',
  createCard: 'New card',
  editCard: 'Edit card',
  newCardTitle: 'New card',

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

  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  deleteConfirm: 'Delete this card?',
  invalidInput: 'Input is incomplete or invalid',
  nameDuplicate: 'Name already exists',
  notFound: 'Card not found',
}
