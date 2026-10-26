/** Browser-safe failure vocabulary of the memory-echo remote face. */
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** A connection-card call carried invalid arguments. */
    'memory-echo/invalid-input': {}
    /** The card name is already taken (names are the tool-facing handles). */
    'memory-echo/name-duplicate': { readonly name: string }
    /** The card id is unknown. */
    'memory-echo/not-found': { readonly id: string }
    /** A requested capability has no implementation yet (service transport). */
    'memory-echo/not-implemented': { readonly kind: string }
    /** The embedding service is not mounted (local model plugin disabled). */
    'memory-echo/embedding-unavailable': {}
    /** The engine produced no usable query vector. */
    'memory-echo/embedding-failed': {}
    /** The local database file at the card address does not exist. */
    'memory-echo/db-missing': { readonly address: string }
    /** The local database exists but carries no knowledge yet. */
    'memory-echo/db-empty': { readonly address: string }
  }
}

/** Keep this file a module so the block above augments, not shadows. */
export {}
