/** UI copy for the Library section (zh first — the product language). */
export interface LibraryKey {
  navLibrary: string
  loadFailed: string
  empty: string
  reload: string

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
  delete: string
  ragDeleteConfirm: string
  ragNeedsEmbedding: string
}

export const zh: LibraryKey = {
  navLibrary: '图书馆',
  loadFailed: '加载失败',
  empty: '暂无内容',
  reload: '刷新',

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
  delete: '删除',
  ragDeleteConfirm: '确定删除该知识库及其全部数据？',
  ragNeedsEmbedding: '需要先在账号列启用本地向量模型',
}

export const en: LibraryKey = {
  navLibrary: 'Library',
  loadFailed: 'Load failed',
  empty: 'Nothing here yet',
  reload: 'Reload',

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
  delete: 'Delete',
  ragDeleteConfirm: 'Delete this knowledge base and all its data?',
  ragNeedsEmbedding: 'Enable the local embedding model first',
}
