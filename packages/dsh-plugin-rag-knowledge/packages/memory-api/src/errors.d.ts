/** Browser-safe failure vocabulary of the rag-knowledge remote face. */
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** A connection-card call carried invalid arguments. */
    'rag-knowledge/invalid-input': {}
    /** The card name is already taken (names are the tool-facing handles). */
    'rag-knowledge/name-duplicate': { readonly name: string }
    /** The card id is unknown. */
    'rag-knowledge/not-found': { readonly id: string }
    /** A requested capability has no implementation yet (service transport). */
    'rag-knowledge/not-implemented': { readonly kind: string }
    /** The embedding service is not mounted (local model plugin disabled). */
    'rag-knowledge/embedding-unavailable': {}
    /** The engine produced no usable query vector. */
    'rag-knowledge/embedding-failed': {}
    /** The local database file at the card address does not exist. */
    'rag-knowledge/db-missing': { readonly address: string }
    /** The local database exists but carries no knowledge yet. */
    'rag-knowledge/db-empty': { readonly address: string }
  }
}

/** Keep this file a module so the block above augments, not shadows. */
export {}
