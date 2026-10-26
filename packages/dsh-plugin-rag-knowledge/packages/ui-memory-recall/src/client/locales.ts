/** UI copy for the rag-knowledge section (zh first — the product language). */
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

  connectDb: string
  queryPlaceholder: string
  filterHint: string
  search: string
  searching: string
  noResults: string

  save: string
  cancel: string
  delete: string
  deleteConfirm: string
  invalidInput: string
  nameDuplicate: string
  notFound: string
}

export const zh: MemoryKey = {
  navMemoryRecall: 'RAG 知识库',
  loadFailed: '加载失败',
  empty: '还没有知识库卡片',
  emptyHint: '新建一张卡片，连接一个 RAG 知识库。',
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

  connectDb: '连接数据库',
  queryPlaceholder: '输入关键字过滤（留空不显示）…',
  filterHint: '输入关键字后按回车过滤；留空不展示任何数据，避免一次列出整库。',
  search: '搜索',
  searching: '检索中…',
  noResults: '没有命中结果',

  save: '保存',
  cancel: '取消',
  delete: '删除',
  deleteConfirm: '确定删除该知识库卡片？',
  invalidInput: '输入不完整或有误',
  nameDuplicate: '名称已存在',
  notFound: '卡片不存在',
}

export const en: MemoryKey = {
  navMemoryRecall: 'RAG Knowledge Base',
  loadFailed: 'Load failed',
  empty: 'No knowledge cards yet',
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

  connectDb: 'Connect database',
  queryPlaceholder: 'Type what to search for…',
  search: 'Search',
  searching: 'Searching…',
  noResults: 'No matches',

  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  deleteConfirm: 'Delete this card?',
  invalidInput: 'Input is incomplete or invalid',
  nameDuplicate: 'Name already exists',
  notFound: 'Card not found',
}
