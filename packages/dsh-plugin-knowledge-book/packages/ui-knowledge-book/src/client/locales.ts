/** UI copy for both Knowledge Book sections (zh first — the product language). */
export interface KnowledgeKey {
  navSkills: string
  navRag: string
  loadFailed: string
  empty: string
  reload: string
  search: string
  byName: string
  bySource: string
  byBody: string
  create: string
  edit: string
  save: string
  cancel: string
  delete: string
  confirmDelete: string
  name: string
  source: string
  body: string
  bodyPreview: string
  saveFailed: string
  savedRenamed: string
  saved: string
  noResults: string
  namePlaceholder: string
  descPlaceholder: string
  bodyPlaceholder: string
  pickSource: string

  ragCreateTitle: string
  ragName: string
  ragDescription: string
  ragAdd: string
  ragChunks: string
  ragDims: string
  ragModel: string
  ragQuery: string
  ragQueryPlaceholder: string
  ragTopK: string
  ragIngest: string
  ragIngestPlaceholder: string
  ragRun: string
  ragResults: string
  ragDeleteConfirm: string
  ragNeedsEmbedding: string
}

export const zh: KnowledgeKey = {
  navSkills: '技能',
  navRag: '知识库',
  loadFailed: '加载失败',
  empty: '暂无内容',
  reload: '刷新',
  search: '搜索',
  byName: '名称',
  bySource: '来源',
  byBody: '正文',
  create: '新建',
  edit: '编辑',
  save: '保存',
  cancel: '取消',
  delete: '删除',
  confirmDelete: '确定删除该技能？',
  name: '名称',
  source: '来源',
  body: '正文',
  bodyPreview: '正文预览',
  saveFailed: '保存失败',
  savedRenamed: '已保存（名称冲突，已自动重命名）',
  saved: '已保存',
  noResults: '没有匹配的技能',
  namePlaceholder: '技能名称（kebab-case）',
  descPlaceholder: '简介（可选，留空取正文首行）',
  bodyPlaceholder: '技能正文（Markdown 指令）',
  pickSource: '选择来源',

  ragCreateTitle: '新建知识库',
  ragName: '名称',
  ragDescription: '描述',
  ragAdd: '添加',
  ragChunks: '条目',
  ragDims: '维度',
  ragModel: '向量模型',
  ragQuery: '查询',
  ragQueryPlaceholder: '输入查询文本…',
  ragTopK: '条数',
  ragIngest: '入库文本',
  ragIngestPlaceholder: '每行一条，粘贴要入库的文本…',
  ragRun: '查询',
  ragResults: '结果',
  ragDeleteConfirm: '确定删除该知识库及其全部数据？',
  ragNeedsEmbedding: '需要先在账号列启用本地向量模型',
}

export const en: KnowledgeKey = {
  navSkills: 'Skills',
  navRag: 'Knowledge',
  loadFailed: 'Load failed',
  empty: 'Nothing here yet',
  reload: 'Reload',
  search: 'Search',
  byName: 'Name',
  bySource: 'Source',
  byBody: 'Body',
  create: 'New',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  confirmDelete: 'Delete this skill?',
  name: 'Name',
  source: 'Source',
  body: 'Body',
  bodyPreview: 'Preview',
  saveFailed: 'Save failed',
  savedRenamed: 'Saved (name conflict auto-renamed)',
  saved: 'Saved',
  noResults: 'No matching skills',
  namePlaceholder: 'Skill name (kebab-case)',
  descPlaceholder: 'Description (optional; falls back to first body line)',
  bodyPlaceholder: 'Skill body (Markdown instructions)',
  pickSource: 'Pick a source',

  ragCreateTitle: 'New knowledge base',
  ragName: 'Name',
  ragDescription: 'Description',
  ragAdd: 'Add',
  ragChunks: 'chunks',
  ragDims: 'dims',
  ragModel: 'Model',
  ragQuery: 'Query',
  ragQueryPlaceholder: 'Query text…',
  ragTopK: 'Top-K',
  ragIngest: 'Ingest text',
  ragIngestPlaceholder: 'One chunk per line…',
  ragRun: 'Search',
  ragResults: 'Results',
  ragDeleteConfirm: 'Delete this knowledge base and all its data?',
  ragNeedsEmbedding: 'Enable the local embedding model first',
}
